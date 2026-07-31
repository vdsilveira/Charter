# SPEC — Charter

> **A tesouraria da empresa agentificada.**
> Uma organização on-chain onde agentes pagam serviços por x402 dentro de uma procuração
> programável, a tesouraria liquida em **valores confidenciais**, e o ativo corporativo é
> permissionado por claims de identidade — os três governados pelo **mesmo registro de
> identidade**.

**Trilhas:** Agentic Payments (x402/MPP) **e** Enterprise / Compliance / RWA.
**Rede:** testnet, valores fictícios (a suíte confidencial é developer preview não auditada).
**Versão:** v5 — inclui a camada confidencial como espaço de transação da plataforma.

---

## 1. A tese

Micropagamento de agente, folha de pagamento e transferência de ativo regulado parecem
problemas diferentes. Têm o mesmo gargalo: **quem pode mover valor, até quanto, para quem —
e quem tem direito de ver.**

Charter responde às quatro perguntas com uma peça só: um **registro de identidade com
claims** (padrão ERC-3643/T-REX), consultado por três camadas de transação.

```
                          ┌────────────────────────────────────┐
                          │   Identity Registry + Claims       │
                          │   (OZ RWA — quem é verificado)     │
                          └──┬───────────┬──────────────┬──────┘
             consulta        │           │              │      consulta
                             ▼           ▼              ▼
        ┌────────────────────────┐ ┌──────────────┐ ┌───────────────────────┐
        │  ComplianceGate        │ │ KybPolicy    │ │ Compliance Modules    │
        │  (policy do agente)    │ │ is_authorized│ │ (RWA)                 │
        │  → paga x402 se ok     │ │ → confidencial│ │ → transfere cota se ok│
        └───────────┬────────────┘ └──────┬───────┘ └──────────┬────────────┘
                    ▼                     ▼                    ▼
        ┌───────────────────────┐ ┌────────────────────┐ ┌──────────────────┐
        │ CAMADA PÚBLICA        │ │ CAMADA CONFIDENCIAL│ │ CAMADA DE ATIVO  │
        │ USDC SAC · x402       │ │ Confidential Token │ │ Token `ALPHA`    │
        │ micropagamento visível│ │ payroll/settlement │ │ cotas do fundo   │
        │ TRILHA AGENTIC        │ │ TRILHA ENTERPRISE  │ │ TRILHA ENTERPRISE│
        └───────────────────────┘ └────────────────────┘ └──────────────────┘
```

**A narrativa:** a `AlphaFund` é uma gestora agentificada.

- Os agentes compram dados de mercado por $0,001 via **x402**, dentro de cota e escopo — micro, frequente, público.
- A **folha de pagamento e o settlement com fornecedores** saem da tesouraria em **valores confidenciais**: quem paga e quem recebe é público, quanto não é. O auditor designado decifra tudo; um fornecedor específico recebe **selective disclosure** de uma transferência só.
- As **cotas do fundo** são um ativo permissionado que só circula entre investidores com claim KYB válido.

**A mesma procuração vale nos dois regimes de visibilidade.** Na camada pública ela é
`ContextRule` + `spending_limit`; na confidencial é `set_spender` com teto e
`live_until_ledger`. O agente nunca tem a chave de gasto do tesouro em nenhuma das duas.

**Por que Stellar:** finalidade em 3–5s, taxa ~0,00001 XLM, USDC nativo, autorização por
*auth entry* (o agente opera sem nunca possuir XLM), e — decisivo — a única rede onde a suíte
OZ de **accounts + RWA + confidential** existe junta, com provas UltraHonk verificadas
on-chain.

---

## 2. Cobertura das trilhas

### Agentic Payments — alvo: *"Agent treasury with policy signers"*

| Critério da trilha | Onde é atendido |
|---|---|
| Smart account com policy signer | OZ `stellar-accounts` + nosso `ComplianceGate` (§4.1) |
| Cap diário de gasto | `policies/spending_limit` (rolling window, OZ) |
| Allow-list de contrato | `ContextRuleType::CallContract` (nativo) |
| Agente paga x402 autonomamente | Fluxo B (§5) |
| Pagamento dentro da política passa | Cenário B |
| Pagamento fora da política **recusado on-chain** | Cenários C e D |

### Enterprise / Compliance / RWA — cobre **três** dos exemplos da trilha

| Exemplo da trilha | Como atendemos |
|---|---|
| *"Private payroll / treasury: amounts hidden from outside observers"* | Fluxo E — folha paga em confidential token, valores ocultos, auditor com visão total |
| *"B2B confidential settlement com allow-list / identity policy"* | Fluxo F — `KybPolicy.is_authorized` consulta o identity registry a cada operação confidencial |
| *"RWA / permissioned token com OZ RWA e access-control (ERC-3643)"* | Fluxo G — token `ALPHA` com identity registry + compliance modules |
| *"Sealed-bid auction com set_spender"* | Fora de escopo — mas usamos `set_spender` para procuração confidencial (§4.4), então o mecanismo está demonstrado |

---

## 3. Posicionamento: o que já existe e o que é nosso

| Camada | Estado da arte | Nossa posição |
|---|---|---|
| Smart account com policies | **OZ `stellar-accounts` v0.7.2** — `spending_limit`, thresholds, verifiers; `examples/multisig-smart-account` como template | **Adotamos** |
| Identidade/claims (T-REX) | **OZ `tokens/rwa`** — `identity_verification/*`, `compliance/modules`; `examples/rwa/*` completo | **Adotamos** |
| Token confidencial | **OZ `tokens/confidential`** (branch `feat/confidential-verifier-ultrahonk`) + **demo `brozorec/stellar-confidential-token-demo`** com `@ctd/sdk`, proving no browser (~1s), contratos já deployados na testnet, `contracts/{policies, token_with_compliance, factory}`, indexer e selective disclosure | **Adotamos como base de infraestrutura** |
| Wallet de agente com policy engine | **Soneso `stellar-agent-wallet`** (alpha, jul/2026) | Escopo deles: delegação individual agente↔operador, com humano aprovando |
| **Uma organização cujos agentes operam nas três camadas sob um único registro de identidade** | **Ninguém** | **É o nosso projeto** |

> **Postura no pitch:** citar tudo isso de frente. *"Não reimplementamos smart account, nem
> T-REX, nem provas ZK. Compomos as três suítes da OpenZeppelin e entregamos o que falta: a
> organização como sujeito, o agente como portador de procuração, e um registro de identidade
> que governa o público, o confidencial e o regulado."* Quem reinventa `spending_limit` gasta
> o hackathon para empatar.

---

## 4. Contratos

> **Achados da fase 0, validados na testnet (§14) — alteram o desenho abaixo:**
> 1. **O teto de gasto é por contrato-alvo, não por agente.** A `spending_limit` rejeita
>    qualquer regra que não seja `ContextRuleType::CallContract` com
>    `OnlyCallContractAllowed` (erro 3227). Um agente que opera dois ativos precisa de duas
>    regras, com dois tetos independentes. `AgentSpec.daily_limit` passa a ser **por alvo**.
> 2. **O exemplo `multisig-account` da OZ é incompatível com a policy vizinha** — cria a regra
>    como `Default`. Daí existir o `CharterAccount` (§4.0).
> 3. **A `spending_limit` é fail-closed e mais restritiva do que se supunha:** só reconhece
>    `transfer(_, _, amount)` (valor em `args.get(2)`); qualquer outra função cai em
>    `NotAllowed` no fim da função. Parte do `allowed_fns` do `ComplianceGate` já vem de graça
>    onde a policy está anexada.
> 4. **O crates.io está atrás do repo:** `stellar-accounts` 0.7.2 depende de `soroban-sdk
>    ^26.1` e gera `duplicate lang item` contra o protocolo 27. Usar dependência **git com
>    commit pinado** (`9b5ed96`), como faz o demo confidencial.

### 4.0 `CharterAccount` — a conta corporativa *(nosso, ~40 linhas)* ✅ implementado

Igual ao exemplo da OZ, exceto no ponto que importa: a context rule nasce como
`ContextRuleType::CallContract(target)`, e o construtor recebe alvo, label do agente e
`valid_until`. Sem isso, nenhuma policy de gasto instala.

```rust
pub fn __constructor(e: &Env, target: Address, label: String, valid_until: Option<u32>,
                     signers: Vec<Signer>, policies: Map<Address, Val>)
// + CustomAccountInterface::__check_auth → smart_account::do_check_auth
// + SmartAccount e ExecutionEntryPoint (traits da OZ, entradas de gestão)
```

### 4.1 `ComplianceGate` — policy do agente na camada pública *(nosso)*

Implementa o trait `Policy` do `stellar-accounts`:

```rust
pub trait Policy {
    type AccountParams: FromVal<Env, Val>;
    fn enforce(e: &Env, context: Context, authenticated_signers: Vec<Signer>,
               context_rule: ContextRule, smart_account: Address);   // panica se reprovar
    fn install(e: &Env, install_params: Self::AccountParams,
               context_rule: ContextRule, smart_account: Address);
    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address);
}
```

```rust
pub struct GateParams {
    pub allowed_fns: Vec<Symbol>,     // ["transfer"] p/ trader; vazio p/ auditor
    pub kyb_threshold: i128,
    pub identity_registry: Address,   // OZ RWA
    pub claim_topic: u32,             // KYB
    pub agent_label: Symbol,
}
// enforce():
//   1. context.fn_name ∈ allowed_fns          senão panic FunctionNotAllowed
//   2. transfer(from,to,amount) e amount > kyb_threshold ⇒
//        identity_registry.is_verified(to, claim_topic)  senão panic CounterpartyNotVerified
//   3. AgentStats: ops_ok += 1, volume_total += amount, volume_attested += amount se verificado
//   4. emite PolicyDecision{...}; extend_ttl
```

Erros: `FunctionNotAllowed` · `CounterpartyNotVerified` · `UnsupportedInvocation`.
Cota estourada → `spending_limit` (OZ). Alvo e validade → `ContextRule` (OZ).
Só `transfer(from,to,amount)` tem valor extraído; o resto cai em `UnsupportedInvocation` —
nunca "deixa passar por não entender".

### 4.2 `KybPolicy` — gate da camada confidencial *(nosso, ~50 linhas)*

O confidential token aceita `ComplianceConfig { policy: Option<Address>, sac_passthrough: bool }`
e invoca, em **toda** operação que muda estado, para **cada conta nomeada**:

```rust
fn is_authorized(e: Env, account: Address, token: Address) -> bool;
```

Nossa implementação consulta o **mesmo** identity registry do `ComplianceGate`:
verificado no tópico KYB **e** não revogado ⇒ `true`. Um fornecedor que perde o claim deixa
de receber pagamento confidencial na operação seguinte, sem migrar nada.

> Este é o ponto que amarra o projeto inteiro: **uma função, e o registro de identidade passa
> a governar também o espaço privado.**

### 4.3 `OrgRegistry` — a camada organizacional *(nosso)*

```rust
pub struct AgentSpec {
    pub label: Symbol, pub pubkey: BytesN<32>, pub role: Symbol,
    pub daily_limit: i128, pub allowed_fns: Vec<Symbol>, pub valid_until: u32,
    pub conf_allowance: i128,        // teto na camada confidencial
    pub conf_until_ledger: u32,      // validade da procuração confidencial
}
pub struct AgentStats {
    pub ops_ok: u32, pub volume_total: i128, pub volume_attested: i128, pub first_seen: u64,
}

fn create_org(e: Env, name: Symbol, founder: Address,
              agents: Vec<AgentSpec>, kyb_threshold: i128) -> Address;
//   deploy da smart account (OZ) + ContextRule por agente
//   + install de spending_limit (OZ) e ComplianceGate (nosso)
//   + registro dos labels (alphafund / trader*alphafund)
fn resolve(e: Env, root: Symbol, label: Option<Symbol>) -> Address;
fn revoke_agent(e: Env, root: Symbol, label: Symbol);
fn credentials_of(e: Env, root: Symbol, label: Symbol) -> AgentCredentials;
```

Atestação **não** é reimplementada — vem do identity registry (§4.5).

### 4.4 Camada confidencial *(OZ + demo, configurada por nós)*

Interface do `ConfidentialToken`:

```rust
register(account, auditor_id, data)                    // prova ZK: chaves derivadas corretamente
deposit(from, to, amount)                              // público → receiving (valor visível)
merge(account)                                         // receiving → spendable (sem prova)
confidential_transfer(from, to, data)                  // prova ZK: saldo suficiente, valor oculto
confidential_transfer_from(spender, from, to, data)    // gasto delegado
set_spender(account, spender, live_until_ledger, data) // procuração: teto + prazo
revoke_spender(account, spender, data)
withdraw(from, to, amount, data)                       // confidencial → público (valor visível)
```

**Como usamos:**

- A tesouraria da org registra conta confidencial e escolhe o **auditor** (vinculado no registro).
- Cada agente/departamento vira **spender** com teto e `live_until_ledger` — a procuração da §1, no regime privado. O tesouro nunca entrega a chave de gasto.
- `ComplianceConfig.policy = KybPolicy` (§4.2); `sac_passthrough` ligado quando o lastro for SAC, para herdar o freeze do emissor sem espelhar estado.
- **Confidencialidade, não anonimato:** endereços permanecem públicos; valores e saldos, não. É exatamente o que um regulador aceita — e o argumento central do pitch enterprise.

### 4.5 Camada RWA *(OZ, configurada por nós)*

`rwa/identity_verification/{identity_registry_storage, claim_issuer, claim_topics_and_issuers, identity_claims}`,
`rwa/compliance/modules`, `access/access_control`.
Emitimos **`ALPHA` — cotas da AlphaFund**, transferível apenas entre endereços com claim KYB
válido. `examples/rwa/*` cobre token, identity-registry, identity-verifier, claim-issuer e
vários módulos de compliance (país, teto de saldo, limite temporal) — é wiring, não pesquisa.

### 4.6 Restrição que molda o design: rejeição não deixa rastro gravável

`Policy::enforce` reprova via **panic** — a transação reverte e leva junto evento e escrita
de estado. Portanto:

- ✅ `ops_ok`, `volume_total`, `volume_attested` on-chain, escritos no `enforce` aprovado
- ❌ `ops_blocked` não pode ser contador on-chain
- ✔️ A tentativa bloqueada existe como **transação falhada com erro tipado**, reconstruída via RPC
- ✔️ Melhor para a UX: o dApp **simula antes de enviar** e mostra *"seria bloqueado por `CounterpartyNotVerified`"* sem queimar transação

---

## 5. Fluxos

**A — Constituição.** Formulário → `create_org` → hash, explorer, endereço da conta, labels,
e registro da conta confidencial da tesouraria com auditor designado.

**B — Agente paga API via x402** *(Agentic).* `GET /market-data` → `402` → o agente assina
**só a auth entry** (zero XLM) → `X-PAYMENT` → facilitador verifica e liquida → `200` + dados,
~5s. Autorização passa por cota (OZ) + escopo (nosso).

**C — Bloqueio por compliance.** Trader tenta $600 para contraparte sem claim KYB. O dApp
simula e mostra o bloqueio; enviada, a transação falha com `CounterpartyNotVerified`. O
compliance officer emite o claim. A **mesma** operação passa.

**D — Separação de funções.** Auditor tenta transferir → `FunctionNotAllowed`.

**E — Folha de pagamento confidencial** *(Enterprise).* A tesouraria paga 3 agentes/prestadores
em uma sessão. On-chain: **quem** pagou **quem**. Não: quanto. Um observador vê três
transferências idênticas em tamanho de payload; a planilha permanece privada.

**F — Settlement B2B com policy gate** *(Enterprise).* Pagamento confidencial a um fornecedor
verificado passa. O compliance officer **revoga** o claim do fornecedor; a operação seguinte é
recusada pelo `KybPolicy` — sem migrar fundos, sem trocar contrato. Depois, o fornecedor
recebe **selective disclosure** provando que aquela transferência pagou exatamente X, sem
revelar o resto do livro.

**G — Ativo permissionado** *(Enterprise).* Cotas `ALPHA` para investidor verificado passam;
para não verificado, recusadas pelo módulo de compliance. **Mesmo registry dos fluxos C e F**
— dito em voz alta no pitch.

**H — Auditoria.** O console do auditor decifra os valores de todas as transferências com a
chave Grumpkin registrada. *Privado para o público, transparente para quem tem direito.*

**I — Console e reputação.** Feed de eventos, leaderboard (confiabilidade, `volume_total`,
`volume_attested`), `/o/[nome]` pública com procurações, claims e histórico, e
`/api/agent/[nome]` legível por máquina.

**J — Contratação: como decidem usar o seu agente.** Quem avalia normalmente **é outro
agente**, em milissegundos:

1. **Procuração — resolve o cold start.** `credentials_of` devolve limites, escopo, validade e
   verificação. Vale **no dia zero**, com histórico vazio: contrata-se contra a *garantia*.
2. **Conduta agregada.** `ops_ok`, `volume_total`, `volume_attested`.
3. **Auditoria completa.** Eventos + transações falhadas reconstroem a timeline.

> **Sobre farmar reputação:** contagem de operações é inflável. Por isso a UI destaca
> **`volume_attested`** — volume com contrapartes que têm claim de terceiro. Inflar isso exige
> convencer entidades verificadas a negociar com você, que é o custo que reputação deveria ter.

---

## 6. Stack

| Camada | Escolha |
|---|---|
| Contratos | Rust, `soroban-sdk` 27, `stellar-accounts` 0.7.2, `stellar-tokens` (rwa + confidential), `stellar-access` |
| Confidential | branch `feat/confidential-verifier-ultrahonk` como dependência git; `token_with_compliance` + `policies` do demo como ponto de partida |
| Cliente confidencial | **`@ctd/sdk`** vendorizado do demo (não publicado no npm) — proving no browser ~1s, decrypt do auditor, selective disclosure; `vendor-bb.mjs` para o Barretenberg |
| Build/deploy | `stellar` CLI 27.1.0; scripts `deploy.ts` / `e2e.ts` do demo como base do nosso `bootstrap` |
| Bindings | `stellar contract bindings typescript` |
| Frontend | Next.js 15 + TypeScript + Tailwind + shadcn/ui; monorepo pnpm |
| Carteira | Freighter (fundador, tesouraria, auditor); chaves de sessão em memória (agentes) |
| x402 | `@x402/express` (seller), `@x402/stellar` (buyer), facilitador OZ Channels testnet |
| Indexação | `packages/indexer` do demo como base do feed e do leaderboard |
| Rede | **Testnet** |

---

## 7. Plano de execução

Fases ordenadas para que cada marco deixe algo submissível. Estimativas indicativas.

| # | Fase | Marco |
|---|---|---|
| 0 | Setup do monorepo; clonar e rodar a demo confidencial na testnet; **spike OZ accounts** (smart account + `spending_limit`) | A demo roda local e uma transferência confidencial acontece na testnet |
| 1 | `ComplianceGate` + testes | Trader passa; auditor bate em `FunctionNotAllowed`; $600 sem claim bate em `CounterpartyNotVerified` |
| 2 | Identity registry RWA no ar + `OrgRegistry` + `create_org` | `credentials_of` responde; claims emitidos e revogados |
| 3 | x402 seller + buyer + worker do agente | 🏁 **Submissão Agentic completa** — loop 402 → pagar → liberar, com recusa on-chain |
| 4 | `KybPolicy` + `token_with_compliance` apontando para o identity registry | Operação confidencial recusada quando o claim é revogado |
| 5 | Tesouraria confidencial: `register`, `deposit`, `merge`, `set_spender` por agente, `confidential_transfer_from` | Fluxos E e F ao vivo |
| 6 | Token `ALPHA` com módulos RWA | 🏁 **Submissão Enterprise completa** — fluxos E, F, G |
| 7 | Console do auditor + selective disclosure | Fluxo H |
| 8 | Frontend: constituição, simulação prévia, feed, leaderboard, `/o/[nome]`, `/api/agent` | Fluxos I e J |
| 9 | Ensaio, README, **vídeo**, pitch | Vídeo gravado antes da entrega |

**Caminho mínimo se o relógio apertar:** fases 0–3 entregam a trilha Agentic inteira; 4–6
entregam a Enterprise. As fases 7 e 8 são apresentação, não substância.

**Ordem de corte:** (1) `/api/agent` → só a página; (2) leaderboard → só o feed;
(3) selective disclosure → só o console do auditor; (4) `create_org` atômico → duas transações.
**Nunca cortar:** `ComplianceGate`, x402 ao vivo, `KybPolicy` recusando no confidencial, e os
cenários C, D, F e G.

---

## 8. Roteiro de demo (5 min)

1. **0:00–0:30** — O problema: três perguntas, um registro. Quem move, quanto, para quem, e quem pode ver.
2. **0:30–1:00** — Constituir a `AlphaFund`: agentes com procuração pública e confidencial, tesouraria registrada com auditor.
3. **1:00–1:45** — `trader*alphafund` compra dados por $0,001 via x402, **sem ter XLM**, ~5s. *(Agentic)*
4. **1:45–2:30** — $600 para contraparte sem KYB → recusado on-chain. Claim emitido. Mesma operação passa. Auditor tenta transferir → `FunctionNotAllowed`.
5. **2:30–3:30** — **Folha de pagamento confidencial:** três pagamentos, valores invisíveis no explorer. Revogar o claim de um fornecedor → próxima operação recusada pelo `KybPolicy`. *(Enterprise)*
6. **3:30–4:15** — Console do auditor decifra os valores; o fornecedor recebe selective disclosure de **uma** transferência. Cotas `ALPHA` recusadas para investidor não verificado.
7. **4:15–5:00** — **"É o mesmo identity registry nas três camadas."** Fechamento: composição com OZ + custo/latência que só fecham na Stellar.

---

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Suíte confidencial é **developer preview não auditada** | Testnet e valores fictícios, declarado no README e no pitch |
| Depende de uma **branch** (`feat/confidential-verifier-ultrahonk`) | Pinar o commit no `Cargo.toml`; não seguir a branch durante o evento |
| `@ctd/sdk` não está no npm | Vendorizar no monorepo e pinar; não tentar publicar |
| Proving no browser inviável no notebook da demo | Medido em ~1s na demo oficial; medir no Bloco 0 e, se preciso, provar em script e exibir o resultado |
| Perda do *opening* `(v, r)` do lado cliente torna fundos não gastáveis | É estado do cliente: persistir e re-derivar pelo caminho de recuperação do SDK; nunca limpar storage do browser durante a demo |
| API da OZ accounts custar mais que escrever à mão | Spike na fase 0, com critério de decisão explícito |
| Facilitador x402 de testnet instável | Fallback MPP Charge / cobrança SAC direta; é critério da trilha, então não pode ser cortado |
| Archival de storage (TTL) na demo | `extend_ttl` em toda escrita; rodar o bootstrap no dia |
| Testnet resetada | Script de bootstrap refaz tudo em um comando |
| Demo ao vivo travar | Vídeo gravado na fase 9 |
| Escopo grande em duas trilhas | Marcos de submissão nas fases 3 e 6; cada um entrega uma trilha sozinho |

---

## 10. Fora de escopo

- **Sealed-bid auction** — usamos `set_spender`, mas o leilão é outro produto
- **MPP Channel mode** — x402 primeiro; channel é upside da mesma trilha
- **Modelos de IA reais nos agentes** — workers determinísticos; o produto é o trilho
- **KYB real com provedor** — claim issuer é conta mock allow-listed; o registry é o trilho
- **Recompilar circuitos Noir** — usar as VKs pinadas do demo
- **Descoberta / marketplace de agentes** — o MVP *verifica* um agente que você já conhece
- **Portabilidade de reputação entre organizações** — o histórico vive na org
- **Mainnet, governança, recuperação de conta, upgrade de contratos, Federation SEP-2**

---

## 11. Trabalho relacionado (README e Q&A)

- **OZ `stellar-accounts` v0.7.2** — [crates.io](https://crates.io/crates/stellar-accounts) · [repo](https://github.com/OpenZeppelin/stellar-contracts). `policies/{spending_limit, thresholds}`, `verifiers/{ed25519, webauthn}`, context rules; `examples/multisig-smart-account`
- **OZ `stellar-tokens` — `rwa/`** — `identity_verification/*`, `compliance/modules`; `examples/rwa/*`. Equivalente a ERC-3643/T-REX
- **OZ Confidential Tokens** — `tokens/src/confidential`, verificador UltraHonk (Nethermind), Pedersen/Grumpkin, dual auditor, selective disclosure. Developer preview desde jun/2026. [Privacy on Stellar](https://developers.stellar.org/docs/build/apps/privacy)
- **Demo oficial** — [`brozorec/stellar-confidential-token-demo`](https://github.com/brozorec/stellar-confidential-token-demo): `@ctd/sdk`, indexer, disclosure, `token_with_compliance`, contratos deployados na testnet
- **Soneso `stellar-agent-wallet`** (alpha, jul/2026) — policy engine, audit log, MCP server. Sem camada organizacional
- **CAP-71 / protocolo 27 — auth delegation** — evolução natural da procuração modular
- **x402 na Stellar** — [docs](https://developers.stellar.org/docs/build/agentic-payments/x402). Facilitador em produção desde mar/2026

---

## 12. Critérios de sucesso

**Agentic**
- [ ] Agente paga API via x402 ponta a ponta, ao vivo, com **zero XLM** na própria conta
- [ ] Um pagamento dentro da política passa; um fora é **recusado on-chain**
- [ ] Cap diário e allow-list de contrato aplicados pelo policy signer

**Enterprise**
- [ ] Folha de pagamento liquidada com **valores invisíveis no explorer**
- [ ] Operação confidencial **recusada** após revogação do claim, via `KybPolicy`
- [ ] Auditor decifra valores; fornecedor recebe selective disclosure de uma transferência
- [ ] Token `ALPHA` recusa transferência para endereço sem claim KYB

**Comuns**
- [ ] **O mesmo identity registry governa as três camadas** — demonstrado, não afirmado
- [ ] `create_org` constitui a organização em uma transação
- [ ] Contraparte decide contratar com **uma leitura on-chain**
- [ ] `volume_attested` separado de `volume_total` no leaderboard
- [ ] Demo completa sem tocar no terminal · vídeo gravado antes da entrega

---

## 13. Estado da implementação — fase 0 concluída

Endereços em [`deployments/testnet.json`](./deployments/testnet.json). Referências externas
clonadas em `reference/` (não versionar).

**Validado na testnet:**

| O quê | Resultado |
|---|---|
| Proving no cliente | `register` 1,8s · `withdraw` 2,6s · `transfer` 2,8s · `disclosure` 1,6s — todos verificados |
| Suíte do SDK confidencial | 33 testes, 25s, sem falhas |
| Fluxo confidencial ponta a ponta | `register → deposit → merge → transfer → withdraw` em 1min02, **provas verificadas on-chain**, saldo reconstruído dos eventos batendo com os commitments |
| Contratos confidenciais próprios | token, verifier, auditor, allowlist, blocklist, factory — 6 VKs registradas, incluindo `set_spender` e `spender_transfer` |
| `CharterAccount` | compila (40KB wasm) e está deployado com `CallContract(XLM SAC)`, label `trader`, signer ed25519 e `spending_limit` de 10 XLM / 17280 ledgers instalada |

**Decisão do spike: adotar OZ.** A API está clara e o custo do que falta escrever é baixo.

**Ainda não validado:** assinar uma invocação com o esquema do smart account (o digest inclui
os `context_rule_ids` para evitar downgrade de regra) e ver a `spending_limit` recusar na
prática. É a primeira tarefa da fase 1 — a documentação do fluxo está no README do exemplo
multisig da OZ, seção 6.

---

## 14. Ambiente já preparado

- MCP `stellar-raven` — **falta autenticar: `/mcp` → Authenticate**
- Plugin `stellar-dev@stellar-dev` v1.2.0, 7 skills (carregam ao reiniciar a sessão)
- `stellar` CLI 27.1.0 em `~/.local/bin` · Rust 1.96 + target `wasm32v1-none`
- Falta: `pnpm`, Freighter no browser, identidade `admin` no `stellar` CLI
