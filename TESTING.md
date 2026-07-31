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

## Comandos

```bash
cd contracts
stellar contract build         # OBRIGATÓRIO antes dos testes do org-registry:
                               # create_org faz deploy por hash de wasm, e o
                               # teste carrega charter_account.wasm do target
cargo test                     # toda a suíte
cargo test -p charter-compliance-gate
cargo test -- --nocapture      # com saída de debug
stellar contract build         # confirma que ainda compila para wasm32v1-none
```

## O que não testamos aqui

Provas ZK do token confidencial e a suíte da OpenZeppelin já têm cobertura própria
(33 testes, validados na fase 0). Não reimplementamos esses testes — testamos **nossa**
composição: que o gate certo é consultado, e que a recusa acontece.
