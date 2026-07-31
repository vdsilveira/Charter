#!/usr/bin/env bash
# Sobe a stack de identidade da OpenZeppelin (ERC-3643 / T-REX) na testnet e
# emite um claim KYB para um fornecedor de teste.
#
# É o registro que governa as três camadas do Charter: o ComplianceGate consulta
# no pagamento do agente, o KybPolicy consulta na operação confidencial, e os
# módulos de compliance do RWA consultam na transferência da cota.
#
# Uso:  ./scripts/bootstrap-identity.sh
# Requer: stellar CLI, identidade `admin` financiada, clone da OZ em reference/.

set -euo pipefail

# Resolver tudo antes do `cd` — caminhos relativos a $0 não sobrevivem a ele.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OZ_DIR="${OZ_DIR:-$ROOT/reference/oz-stellar-contracts}"
OUT="${OUT:-$ROOT/deployments/identity-testnet.json}"
SDK_DIR="$ROOT/reference/confidential-demo/packages/sdk"
WASM="$OZ_DIR/target/wasm32v1-none/release"
KYB_TOPIC=1

cd "$OZ_DIR"
stellar network use testnet >/dev/null

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }

# --- identidades -----------------------------------------------------------
say "identidades"
for k in supplier stranger; do
  stellar keys generate "$k" --network testnet --fund >/dev/null 2>&1 || true
  echo "  $k = $(stellar keys address "$k")"
done
SUPPLIER=$(stellar keys address supplier)
STRANGER=$(stellar keys address stranger)

# Chave ed25519 que assina os claims. Gerada aqui — a do exemplo da OZ é
# pública e não deve ser usada nem em testnet.
#
# A ferramenta `sign-claim` imprime apenas --data e --signature, então a chave
# pública é derivada do seed à parte. ed25519-dalek trata o secret key como
# seed de 32 bytes, que é exatamente o que `fromRawEd25519Seed` consome.
ISSUER_SK="${ISSUER_SK:-$(openssl rand -hex 32)}"
ISSUER_PK=$(cd "$SDK_DIR" && node --input-type=module -e "
import { Keypair } from '@stellar/stellar-sdk';
const kp = Keypair.fromRawEd25519Seed(Buffer.from('$ISSUER_SK', 'hex'));
process.stdout.write(Buffer.from(kp.rawPublicKey()).toString('hex'));
")
echo "  claim issuer pubkey = $ISSUER_PK"

SIGN_CLAIM="$OZ_DIR/examples/rwa/sign-claim"

# --- 1. claim topics and issuers -------------------------------------------
say "1/6 claim-topics-and-issuers"
CTI=$(stellar contract deploy --alias cti --wasm "$WASM/rwa_claim_topics_and_issuers_example.wasm" \
  -- --admin admin --manager admin 2>&1 | tail -1)
echo "  $CTI"
stellar contract invoke --id "$CTI" --source admin -- \
  add_claim_topic --claim_topic $KYB_TOPIC --operator admin >/dev/null
echo "  tópico KYB=$KYB_TOPIC registrado"

# --- 2. claim issuer --------------------------------------------------------
say "2/6 claim-issuer"
CI=$(stellar contract deploy --alias claim-issuer --wasm "$WASM/rwa_claim_issuer_example.wasm" \
  -- --owner admin 2>&1 | tail -1)
echo "  $CI"
stellar contract invoke --id "$CTI" --source admin -- \
  add_trusted_issuer --trusted_issuer "$CI" --claim_topics "[$KYB_TOPIC]" --operator admin >/dev/null
stellar contract invoke --id "$CI" --source admin -- \
  allow_key --public_key "$ISSUER_PK" --registry "$CTI" --claim_topic $KYB_TOPIC >/dev/null
echo "  issuer confiável para o tópico $KYB_TOPIC"

# --- 3. identidade do fornecedor -------------------------------------------
say "3/6 identity (supplier)"
SUPPLIER_ID=$(stellar contract deploy --alias identity-supplier --wasm "$WASM/rwa_identity_example.wasm" \
  -- --owner supplier 2>&1 | tail -1)
echo "  $SUPPLIER_ID"

# --- 4. claim KYB assinado --------------------------------------------------
say "4/6 claim KYB assinado"
CLAIM=$(cd "$SIGN_CLAIM" && cargo run --quiet -- \
  --secret-key "$ISSUER_SK" --claim-issuer "$CI" --identity "$SUPPLIER_ID" --claim-topic $KYB_TOPIC)
# A ferramenta alinha a saída com múltiplos espaços ("--data      abc..."),
# então o campo é lido por posição, não por um separador fixo.
SIG=$(echo "$CLAIM" | awk '/^--signature/ {print $2}')
DATA=$(echo "$CLAIM" | awk '/^--data/ {print $2}')
[ -n "$SIG" ] && [ -n "$DATA" ] || { echo "sign-claim não devolveu assinatura/dados:"; echo "$CLAIM"; exit 1; }
stellar contract invoke --id "$SUPPLIER_ID" --source supplier -- \
  add_claim --topic $KYB_TOPIC --scheme 101 --issuer "$CI" \
  --signature "$SIG" --data "$DATA" --uri "https://charter.example/kyb/supplier" >/dev/null
echo "  claim adicionado à identidade do fornecedor"

# --- 5. identity registry ---------------------------------------------------
say "5/6 identity-registry"
REG=$(stellar contract deploy --alias identity-registry --wasm "$WASM/rwa_identity_registry_example.wasm" \
  -- --admin admin --manager admin 2>&1 | tail -1)
echo "  $REG"
# `initial_profiles` é `Vec<Val>` de `CountryData` — struct de duas chaves, que
# o CLI não serializa em campo de tipo livre ("expected map with a single key").
# Lista vazia também não serve: o contrato responde EmptyCountryList (323).
# Por isso este passo vai por um script que monta o ScVal à mão.
ADMIN_SK=$(stellar keys show admin)
(node "$ROOT/scripts/add-identity.mjs" \
  "$REG" "$SUPPLIER" "$SUPPLIER_ID" "$ADMIN_SK" 76) >/dev/null
echo "  fornecedor vinculado à identidade (BR=76)"

# --- 6. identity verifier ---------------------------------------------------
say "6/6 identity-verifier"
VERIFIER=$(stellar contract deploy --alias identity-verifier --wasm "$WASM/rwa_identity_verifier_example.wasm" \
  -- --admin admin --manager admin \
  --identity_registry_storage "$REG" --claim_topics_and_issuers "$CTI" 2>&1 | tail -1)
echo "  $VERIFIER"

cat > "$OUT" <<JSON
{
  "network": "testnet",
  "claimTopicsAndIssuers": "$CTI",
  "claimIssuer": "$CI",
  "identityRegistry": "$REG",
  "identityVerifier": "$VERIFIER",
  "supplierIdentity": "$SUPPLIER_ID",
  "supplier": "$SUPPLIER",
  "stranger": "$STRANGER",
  "kybTopic": $KYB_TOPIC,
  "issuerPublicKey": "$ISSUER_PK"
}
JSON

say "pronto — $OUT"
echo "verificar:  stellar contract invoke --id $VERIFIER -- verify_identity --account $SUPPLIER"
echo "recusar:    stellar contract invoke --id $VERIFIER -- verify_identity --account $STRANGER"
