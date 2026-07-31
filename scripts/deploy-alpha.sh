#!/usr/bin/env bash
# Sobe o ativo permissionado `ALPHA` — cotas da AlphaFund — na testnet.
#
# O ponto da fase 6 não é ter mais um token: é que a cota consulta o MESMO
# identity registry que o ComplianceGate consulta no pagamento do agente e que a
# KybPolicy consulta na operação confidencial. Por isso este script reusa a
# stack de `deployments/identity-testnet.json` em vez de subir outra — se subir
# outra, a frase do pitch deixa de ser verdade.
#
# Uso:  ./scripts/deploy-alpha.sh
# Requer: stellar CLI, identidade `admin` financiada, stack de identidade no ar.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OZ_DIR="${OZ_DIR:-$ROOT/reference/oz-stellar-contracts}"
IDENT="$ROOT/deployments/identity-testnet.json"
OUT="${OUT:-$ROOT/deployments/alpha-testnet.json}"
WASM="$OZ_DIR/target/wasm32v1-none/release"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
jq_field() { python3 -c "import json;print(json.load(open('$IDENT'))['$1'])"; }

REG=$(jq_field identityRegistry)
VERIFIER=$(jq_field identityVerifier)

cd "$OZ_DIR"
stellar network use testnet >/dev/null

echo "identity registry = $REG"
echo "identity verifier = $VERIFIER"

# --- 1. compliance ----------------------------------------------------------
# Sem módulos registrados o contrato aprova tudo — a regra de quem pode receber
# vem do identity verifier. Módulos (país, teto, lockup) entram depois sem
# tocar no token.
say "1/3 compliance"
COMPLIANCE=$(stellar contract deploy --alias alpha-compliance \
  --wasm "$WASM/rwa_compliance_example.wasm" \
  -- --admin admin --manager admin 2>&1 | tail -1)
echo "  $COMPLIANCE"

# --- 2. token ---------------------------------------------------------------
say "2/3 token ALPHA"
TOKEN=$(stellar contract deploy --alias alpha-token \
  --wasm "$WASM/rwa_token_example.wasm" \
  -- --name "AlphaFund Shares" --symbol "ALPHA" \
  --admin admin --manager admin \
  --compliance "$COMPLIANCE" --identity_verifier "$VERIFIER" 2>&1 | tail -1)
echo "  $TOKEN"

# --- 3. vínculos ------------------------------------------------------------
# O registro e o compliance precisam saber qual token servem. Sem `bind_token`
# o token existe mas nenhuma das duas pontas o reconhece.
say "3/3 bind_token nas duas pontas"
stellar contract invoke --id "$REG" --source admin -- \
  bind_token --token "$TOKEN" --operator admin >/dev/null
echo "  identity registry ✓"
stellar contract invoke --id "$COMPLIANCE" --source admin -- \
  bind_token --token "$TOKEN" --operator admin >/dev/null
echo "  compliance ✓"

# Conferência: o CLI grava `None` em `Option<Address>` sem avisar, e um token
# sem verifier aceitaria qualquer endereço. Vale a chamada extra.
ON_CHAIN_VERIFIER=$(stellar contract invoke --id "$TOKEN" --source admin -- identity_verifier 2>&1 | tail -1 | tr -d '"')
[ "$ON_CHAIN_VERIFIER" = "$VERIFIER" ] || {
  echo "✗ o token subiu com identity_verifier = $ON_CHAIN_VERIFIER"; exit 1;
}
echo "  identity_verifier confere com a stack de identidade"

cat > "$OUT" <<JSON
{
  "network": "testnet",
  "token": "$TOKEN",
  "compliance": "$COMPLIANCE",
  "identityRegistry": "$REG",
  "identityVerifier": "$VERIFIER",
  "name": "AlphaFund Shares",
  "symbol": "ALPHA",
  "decimals": 7,
  "note": "Cotas ALPHA (fase 6). O identityRegistry/identityVerifier aqui são os mesmos de identity-testnet.json — é essa reutilização que o teste 'usa o mesmo identity registry' verifica."
}
JSON

say "pronto — $OUT"
echo "emitir:  stellar contract invoke --id $TOKEN --source admin -- mint --to <conta verificada> --amount 1000000000 --operator admin"
