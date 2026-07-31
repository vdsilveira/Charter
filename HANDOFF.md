# Estado do Charter — retomada

Última sessão: 31/07/2026. Este arquivo existe para outra sessão continuar sem
reconstruir contexto. `SPEC.md` diz o que construir, `PRD.md` por quê,
`TESTING.md` como testar, e este diz **onde paramos**.

---

## Onde paramos

| Fase | Estado | Evidência |
|---|---|---|
| 0 · fundação, proving, spike OZ | ✅ | provas 1,6–2,8s; fluxo confidencial ponta a ponta na testnet |
| 1 · `ComplianceGate` | ✅ | 15 testes verdes |
| 2 · identidade RWA + `OrgRegistry` | ✅ | 10 testes; stack ERC-3643 no ar |
| 3 · x402 | ⚠️ **parcial** | policy provada on-chain; falta chave externa (§Bloqueios) |
| 4 · gate confidencial | ✅ | `NotAuthorizedByPolicy (3602)` na testnet |
| 5 · tesouraria confidencial | ✅ | 6 testes verdes + 3 skip justificados (`set_spender`) |
| 6 · ativo permissionado `ALPHA` | ⬜ iniciada | wasm construídos, nada implantado |
| 7 · auditoria e disclosure | ⬜ | 6 casos escritos, todos vermelhos |
| 8 · console e credencial | ⬜ | 7 casos escritos, todos vermelhos |

**Contratos: 35 testes Rust verdes.** `cd contracts && stellar contract build && cargo test`

**Integração: 29 casos escritos**, 6 verdes na fase 5 + 3 skip justificados. Fases
6–8 seguem vermelhas por serem trabalho não feito, não por defeito.

---

## Próximo passo imediato

**Fase 6 — ativo permissionado `ALPHA`** (§ no fim deste arquivo). É o marco da
submissão Enterprise e o único que falta para fechar os fluxos E, F e G.

---

## Bloqueios que dependem de ação humana

1. **x402 — `OZ_API_KEY`**: gerar em <https://channels.openzeppelin.com/testnet/gen>
   (formulário web). Sem ela o servidor sobe sem meio de pagamento.
2. **x402 — USDC de testnet**: <https://faucet.circle.com/> (captcha), mais
   trustline de USDC nas duas contas.
   Com as duas coisas: `pnpm x402:server` e `pnpm x402:agent`.
3. **Notion do evento**: `app.notion.com` exige login e `notion.so` está
   bloqueado neste ambiente. Publicar a página (Share → Publish to web) ou colar
   o conteúdo. **Importa**: a busca sugeriu que o evento pode ser em 6/08/2026 —
   se for, o cronograma do SPEC precisa encolher.
4. **MCP `stellar-raven`**: autenticar com `/mcp` → Authenticate.

---

## Limitação técnica confirmada

**`set_spender` (procuração confidencial) não é implementável com o SDK atual.**
O circuito existe e a VK está registrada na rede, mas o `@ctd/sdk` não expõe
witness builder para ele — não há como montar a prova pelo cliente. Escrever
esse builder do zero, para circuito de terceiros e sem especificação dos
inputs, é risco desproporcional. Os três testes ficam `skip` com o motivo à
vista, e o SPEC deve mover o item para roadmap.

Consequência para o pitch: a procuração confidencial por agente sai da demo. O
que **fica** é o Fluxo E (folha com valores ocultos) e o Fluxo F (revogação de
claim recusando a operação seguinte) — ambos funcionando.

---

## Fatos operacionais que custaram tempo

Estão nos comentários do código, repetidos aqui porque economizam horas:

- **O CLI grava `None` em `Option<Address>` sem avisar.** O primeiro token
  confidencial subiu sem gate nenhum. Todo deploy com parâmetro opcional
  confere a config depois — `scripts/deploy-gated-token.mjs` faz isso.
- **O CLI não serializa struct em campo `Val` livre.** Vale para
  `add_identity` (`Vec<Val>` de `CountryData`) e para os parâmetros das
  policies. Esses deploys vão por script JS montando ScVal.
- **Raiz das chaves confidenciais precisa ser determinística.** O opening
  `(v, r)` vive só no cliente; com raiz aleatória, o saldo da execução anterior
  fica inacessível e o registro on-chain vira lixo (`InvalidProof`). Contas
  `treasury`/`vendor1` foram queimadas assim; as boas são `tesouraria` e
  `fornecedor`.
- **`install` e `enforce` na mesma frame de teste** dão `Error(Auth, ExistingValue)`.
  Blocos `as_contract` separados, como faz a OZ.
- **`spending_limit` exige `ContextRuleType::CallContract`** (erro 3227): o teto
  é sempre por contrato-alvo, nunca global.
- **Signers de smart account assinam `sha256(payload ‖ context_rule_ids)`**, não
  o payload do host.
- **Proving repetido no mesmo processo trava.** Uma execução ficou 900s sem
  saída. Onde `deposit`/`merge` provam a mesma coisa, usar eles.
- **Evento de transação não sai mais do meta.** No protocolo 23+ o meta é
  `TransactionMetaV4` e `meta.v3()` levanta `v3 not set` — era isto que derrubava
  o teste da folha, não a asserção. Os eventos vêm em `tx.events.contractEventsXdr`
  (uma lista por operação), e `contractId()` ali é hash cru: `StrKey.encodeContract`,
  não `Address.fromScAddress`.
- **`CircuitProver` precisa de `destroy()`.** Os worker threads do UltraHonk
  seguram o event loop; sem isso a suíte da fase 5 levava 274s e terminava com
  "Promise resolution is still pending". Com `after()` destruindo, 23s.

---

## Chaves e endereços

Endereços em `deployments/testnet.json` e `deployments/identity-testnet.json`.

**Não versionados, necessários para continuar:**
- `.env.identity` — `ISSUER_SK`, chave do claim issuer. **Sem ela não se emitem
  novos claims** e a única saída é subir uma stack de identidade nova
  (`./scripts/bootstrap-identity.sh`).
- `.env.demo` — `ADMIN_SECRET`, `AGENT_SECRET`, `ACCOUNT_WASM_HASH`.

Identidades no `stellar` CLI: `admin` (deployer), `supplier` e `stranger`
(verificado / não verificado), `tesouraria` e `fornecedor` (contas limpas do
payroll), `treasury` e `vendor1` (**queimadas** — chaves confidenciais perdidas).

Emitir claim para uma conta nova: `./scripts/issue-claim.sh <alias>`.

---

## Comandos

```bash
# contratos
cd contracts && stellar contract build && cargo test && cd ..

# integração (precisa dos deployments e das chaves)
pnpm test
node --test test/treasury.test.mjs

# demos que funcionam hoje
node scripts/agent-payment-demo.mjs      # dentro da política liquida, fora é recusado
node scripts/confidential-gate-demo.mjs  # com claim passa, sem claim → 3602
node scripts/payroll-demo.mjs            # folha com valor oculto

# infraestrutura
./scripts/bootstrap-identity.sh          # sobe a stack ERC-3643 do zero
./scripts/issue-claim.sh <alias>         # emite claim KYB
node scripts/deploy-gated-token.mjs <kybPolicy>
```

---

## Fase 6 — o que já está pronto para usar

`rwa_token_example.wasm` e `rwa_compliance_example.wasm` já compilados em
`reference/oz-stellar-contracts/target/wasm32v1-none/release/`.

Sequência do README da OZ (`examples/rwa/README.md`, seções 8–9), que **deve
reusar a stack de identidade já no ar** em vez de subir outra — é essa reutilização
que sustenta a frase "é o mesmo registro nas três camadas":

1. deploy do `compliance` (admin, manager)
2. deploy do token: `--name "AlphaFund Shares" --symbol ALPHA --admin admin
   --manager admin --compliance $COMPLIANCE --identity_verifier $VERIFIER`
3. `bind_token` no identity-registry **e** no compliance
4. `mint` para conta verificada → deve passar; para `stranger` → deve ser recusado
5. transferência entre verificados passa; para não verificado, recusada

Os 7 casos estão em `test/permissioned-asset.test.mjs`, todos vermelhos.
