#!/usr/bin/env bash
# Emite um claim KYB para uma conta, reusando a stack de identidade já no ar.
#
# É o que o compliance officer faz na demo: dá a um endereço o direito de
# receber valor acima do limiar e de operar no espaço confidencial.
#
# Uso:  ISSUER_SK=<hex> ./scripts/issue-claim.sh <alias>
# A chave do issuer fica em .env.identity (não versionada) — sem ela não se
# emitem novos claims, e a única saída é subir uma stack nova.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OZ_DIR="${OZ_DIR:-$ROOT/reference/oz-stellar-contracts}"
IDENT="$ROOT/deployments/identity-testnet.json"
WASM="$OZ_DIR/target/wasm32v1-none/release"
KYB_TOPIC=1

ALIAS="${1:?uso: issue-claim.sh <alias da identidade no stellar CLI>}"

# shellcheck disable=SC1091
[ -f "$ROOT/.env.identity" ] && . "$ROOT/.env.identity"
: "${ISSUER_SK:?defina ISSUER_SK (veja .env.identity)}"

CTI=$(python3 -c "import json;print(json.load(open('$IDENT'))['claimTopicsAndIssuers'])")
CI=$(python3 -c "import json;print(json.load(open('$IDENT'))['claimIssuer'])")
REG=$(python3 -c "import json;print(json.load(open('$IDENT'))['identityRegistry'])")

stellar keys generate "$ALIAS" --network testnet --fund >/dev/null 2>&1 || true
SUBJECT=$(stellar keys address "$ALIAS")
echo "  $ALIAS = $SUBJECT"

cd "$OZ_DIR"

# 1. contrato de identidade do sujeito
IDC=$(stellar contract deploy --wasm "$WASM/rwa_identity_example.wasm" --source "$ALIAS" \
  -- --owner "$ALIAS" 2>&1 | tail -1)
echo "  identidade = $IDC"

# 2. claim assinado pelo issuer confiável
CLAIM=$(cd "$OZ_DIR/examples/rwa/sign-claim" && cargo run --quiet -- \
  --secret-key "$ISSUER_SK" --claim-issuer "$CI" --identity "$IDC" --claim-topic $KYB_TOPIC)
SIG=$(echo "$CLAIM" | awk '/^--signature/ {print $2}')
DATA=$(echo "$CLAIM" | awk '/^--data/ {print $2}')
[ -n "$SIG" ] && [ -n "$DATA" ] || { echo "sign-claim não devolveu assinatura"; exit 1; }

stellar contract invoke --id "$IDC" --source "$ALIAS" -- \
  add_claim --topic $KYB_TOPIC --scheme 101 --issuer "$CI" \
  --signature "$SIG" --data "$DATA" --uri "https://charter.example/kyb/$ALIAS" >/dev/null
echo "  claim KYB adicionado"

# 3. vínculo conta → identidade (via ScVal: o CLI não serializa CountryData)
ADMIN_SK=$(stellar keys show admin)
node "$ROOT/scripts/add-identity.mjs" "$REG" "$SUBJECT" "$IDC" "$ADMIN_SK" 76 >/dev/null
echo "  vinculado ao identity registry"

# 4. conferência — um claim que não verifica não serve para nada
VERIFIER=$(python3 -c "import json;print(json.load(open('$IDENT'))['identityVerifier'])")
if stellar contract invoke --id "$VERIFIER" --source admin -- \
  verify_identity --account "$SUBJECT" >/dev/null 2>&1; then
  echo "  ✅ verificado"
else
  echo "  ✗ verify_identity falhou depois de emitir o claim"
  exit 1
fi
