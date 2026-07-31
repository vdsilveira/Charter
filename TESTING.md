# Procedimento de testes — Charter

TDD é obrigatório para todo contrato deste repositório. O motivo não é cerimônia: os erros
que este projeto pode cometer são **silenciosos**. Uma policy que aprova o que deveria
recusar não quebra nada visível — ela só deixa de proteger. Só o teste da recusa prova que
o enforcement existe.

## O ciclo

1. **Red** — escrever o teste antes da implementação. Ele deve falhar por ausência de
   comportamento, não por erro de compilação.
2. **Green** — a implementação mínima que passa.
3. **Refactor** — com a rede de testes verde.

Um contrato só é considerado pronto quando **cada caminho de recusa tem um teste com
`#[should_panic(expected = "Error(Contract, #N)")]`**. Caminho feliz sem caminho de recusa
não conta como cobertura aqui.

## Regra de ouro deste projeto

> Para cada regra de autorização, existem dois testes: um que **passa dentro da política** e
> um que **é recusado fora dela**. Se só existe o primeiro, a regra não está testada — está
> declarada.

Isso vale para cada linha da §12 do PRD e para cada cenário da demo. Os cenários C, D, F e G
do `SPEC.md` são, antes de serem demonstração, casos de teste.

## Padrão técnico

Seguimos o harness da própria OpenZeppelin
(`packages/accounts/src/policies/test/spending_limit.rs`):

```rust
let e = Env::default();
let address = e.register(MockContract, ());   // contrato hospedeiro do estado
e.mock_all_auths();
e.as_contract(&address, || {
    // install / enforce / asserts rodam no contexto do contrato
});
```

Elementos que todo teste de policy precisa montar à mão:

| Elemento | Como construir |
|---|---|
| `ContextRule` | struct literal; `context_type: ContextRuleType::CallContract(token)` — **obrigatório** para policies de gasto (erro 3227) |
| `Context` de invocação | `Context::Contract(ContractContext { contract, fn_name, args })` |
| Argumentos de `transfer` | `args = [from, to, amount]` — o valor está em `args.get(2)` |
| Signers autenticados | `Vec<Signer>` com `Signer::Delegated(addr)`; lista vazia deve ser recusada |
| Avanço de tempo | `e.ledger().set_sequence_number(...)` para testar janela e expiração |

## Dependências externas nos testes

Contratos externos (identity registry, token confidencial) entram como **mock local**
declarado com `#[contract]` no próprio arquivo de teste, respeitando a assinatura real:

```rust
// A interface real da OZ é verify_identity(account) e PANICA quando não verificado —
// não existe is_verified(...) -> bool. Quem precisa de booleano usa try_verify_identity.
#[contractclient(name = "IdentityVerifierClient")]
pub trait IdentityVerifier {
    fn verify_identity(e: &Env, account: Address);
}
```

Mockar com assinatura inventada é pior que não testar: dá confiança falsa e quebra na
integração. Sempre conferir a assinatura no fonte da OZ antes de escrever o mock.

## Cobertura mínima por contrato

### `ComplianceGate` — 15 testes ✅
- [ ] `transfer` de função permitida, abaixo do limiar → passa
- [ ] função fora da allow-list → `FunctionNotAllowed`
- [ ] invocação que não é `transfer(from,to,amount)` → `UnsupportedInvocation`
- [ ] `transfer` acima do limiar com contraparte **verificada** → passa
- [ ] `transfer` acima do limiar com contraparte **não verificada** → `CounterpartyNotVerified`
- [ ] `transfer` acima do limiar após **revogação** do claim → recusado
- [ ] lista de signers autenticados vazia → recusado
- [ ] `ops_ok` e `volume_total` incrementam apenas no caminho aprovado
- [ ] `volume_attested` só incrementa quando a contraparte é verificada
- [ ] evento `PolicyDecision` emitido no caminho aprovado
- [ ] `install` duplicado → `AlreadyInstalled`
- [ ] `enforce` sem `install` → `NotInstalled`

### `KybPolicy` — 6 testes ✅
- [ ] conta verificada → `is_authorized == true`
- [ ] conta não verificada → `is_authorized == false` (**não** panica: o token confidencial espera booleano)
- [ ] claim revogado → `false` na chamada seguinte
- [ ] registry inacessível → `false` (fail-closed)

### `OrgRegistry` — 10 testes ✅
- [x] `create_org` cria conta e resolve os labels dos agentes
- [x] nome de organização duplicado → `NameTaken`
- [x] constituição sem agentes → `NoAgents`
- [x] `resolve` de agente revogado → `AgentRevoked` (nunca devolve endereço obsoleto)
- [x] agente revogado ainda aparece em `credentials_of` como inativo — a
      contraparte precisa distinguir "revogado" de "nunca existiu"
- [x] `credentials_of` agrega escopo, conduta e verificação em uma leitura
- [x] `credentials_of` reporta organização não verificada, em vez de falhar
- [x] o segundo agente mapeia para a segunda context rule (a ordem liga rótulo
      a procuração; se ela se perder, devolve-se a procuração do agente errado)
- [x] organização/agente inexistente → `OrgNotFound` / `AgentNotFound`

### `CharterAccount` — 4 testes ✅
- [x] uma `ContextRule` por agente, do tipo `CallContract(target)`
- [x] os `context_rule_id` seguem a ordem de `agents`
- [x] `valid_until` preservado
- [x] conta sem agentes → `NoAgents`

---

# Fases 5–8 — testes de integração

As fases restantes não acrescentam lógica em Rust: elas **compõem** contratos que já
existem (OZ confidential, OZ RWA) e expõem o resultado. Testá-las com unit test de
contrato provaria a suíte da OpenZeppelin, não o nosso trabalho. O que precisa de prova é
a composição, e ela só existe contra a rede.

Por isso a suíte daqui para frente é de **integração contra a testnet**, com
`node:test`, em `test/`. Vale a mesma regra de ouro: para cada regra, um teste que passa
dentro dela e um que é recusado fora.

```bash
pnpm test                # tudo (precisa de deployments/*.json e das chaves)
pnpm test:fase5          # só a tesouraria confidencial
```

**Três restrições que moldam estes testes:**

1. **Sem proving no caminho crítico.** `deposit`, `merge` e `set_spender` acionam os
   mesmos hooks de compliance que `register`/`transfer`, sem custo de prova. Onde a prova
   for indispensável (transferência confidencial de fato), o teste é marcado `slow` e
   fica fora do caminho da demo — o proving repetido já travou uma execução por 900s.
2. **Estado da rede é persistente.** Um teste que registra uma conta não pode ser
   reexecutado do zero. Cada teste ou usa conta nova de friendbot, ou trata o estado já
   existente como pré-condição satisfeita (ex.: `AccountAlreadyRegistered` = já provado).
3. **Recusa é o teste.** Um `deposit` que falha por saldo insuficiente e um que falha por
   compliance são indistinguíveis se o teste só verificar "deu erro". Todo teste de
   recusa casa **o código do erro** (`3602`, `3221`, `320x`), nunca só a ausência de
   sucesso.

## Fase 5 — tesouraria confidencial (`test/treasury.test.mjs`)

Fluxos E e F do SPEC: folha de pagamento com valores ocultos e procuração confidencial
por agente.

- [ ] a tesouraria registra conta confidencial e deposita → saldo passa a existir
- [ ] `merge` move o recebido para gastável (sem prova, como o protocolo prevê)
- [ ] **`set_spender` cria a procuração confidencial do agente** com teto e
      `live_until_ledger` → `is_spender(tesouraria, agente)` = `true`
- [ ] `is_spender` de um agente que nunca recebeu delegação = `false`
- [ ] **delegação expirada** (`live_until_ledger` no passado) → `is_spender` = `false`
      sem precisar revogar
- [ ] `revoke_spender` devolve a alçada ao tesouro → `is_spender` = `false`
- [ ] duas delegações para o mesmo par → `DelegationAlreadyExists` (3503)
- [ ] **o valor não aparece na rede**: o evento de depósito publica o valor (é a fronteira
      pública), mas o de `set_spender` **não** — asseverar que o valor delegado não está
      em claro no evento
- [ ] operação confidencial de conta **sem claim** → `NotAuthorizedByPolicy` (3602)
- [ ] operação confidencial de conta **com claim** → liquida
- [ ] `slow`: `confidential_transfer_from` gasta da alçada e o saldo do tesouro muda

## Fase 6 — ativo permissionado `ALPHA` (`test/permissioned-asset.test.mjs`)

Marco da submissão Enterprise. O ativo usa o **mesmo** identity registry das fases 2 e 4.

- [ ] emissão para investidor **verificado** → saldo creditado
- [ ] emissão para endereço **sem claim** → recusada pelo módulo de compliance
- [ ] transferência entre verificados → liquida
- [ ] **transferência de verificado para não verificado → recusada on-chain**
- [ ] após **revogar o claim** do destinatário, a transferência seguinte é recusada —
      sem migrar fundos nem trocar contrato (é o Fluxo F na camada de ativo)
- [ ] `freeze` do emissor bloqueia a transferência de uma conta antes verificada
- [ ] o registry consultado é o mesmo endereço usado pelo `ComplianceGate` — asserção
      explícita, porque é a frase que o pitch faz

## Fase 7 — auditoria e disclosure (`test/audit.test.mjs`)

- [ ] o auditor designado **decifra** o valor de uma transferência que o público não vê
- [ ] auditor com chave errada **não** recupera o valor
- [ ] disclosure de **uma** transferência prova o valor exato ao destinatário indicado
- [ ] disclosure vinculada a outro evento (troca de `R_e`) é rejeitada
- [ ] disclosure com nonce repetido é rejeitada (replay)
- [ ] o destinatário da disclosure **não** aprende nada sobre as demais transferências

> A suíte do SDK confidencial já cobre a criptografia (19 testes de disclosure na fase 0).
> Aqui testamos que **a nossa tesouraria** é auditável: que o auditor que a organização
> designou consegue abrir o que precisa, e só isso.

## Fase 8 — console e credencial (`test/console.test.mjs`)

- [ ] `/api/agent/[org]/[label]` devolve procuração, conduta e verificação em uma resposta
- [ ] agente inexistente → 404 com corpo legível por máquina, não stack trace
- [ ] agente revogado → `active: false` (não some da resposta: a contraparte precisa
      distinguir revogado de inexistente)
- [ ] o feed reconstrói as decisões **só a partir de eventos da cadeia**, sem banco próprio
- [ ] o leaderboard mostra `volume_attested` separado de `volume_total`
- [ ] **simulação prévia**: uma operação que seria recusada é sinalizada na UI **sem**
      enviar transação — asserção sobre o resultado da simulação, não sobre a tela
- [ ] a página pública responde sem carteira conectada (é para a contraparte, não para o dono)

## Comandos

```bash
cd contracts
stellar contract build         # OBRIGATÓRIO antes dos testes do org-registry:
                               # create_org faz deploy por hash de wasm, e o
                               # teste carrega charter_account.wasm do target
cargo test                     # toda a suíte de contratos
cargo test -p charter-compliance-gate
cargo test -- --nocapture      # com saída de debug

cd ..
pnpm test                      # integração contra a testnet (fases 5–8)
```

## O que não testamos aqui

Provas ZK do token confidencial e a suíte da OpenZeppelin já têm cobertura própria
(33 testes, validados na fase 0). Não reimplementamos esses testes — testamos **nossa**
composição: que o gate certo é consultado, e que a recusa acontece.
