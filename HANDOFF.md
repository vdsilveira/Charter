# Estado do Charter — retomada

Última sessão: 01/08/2026. Fases 0–8 do SPEC concluídas, mais o bloco de
produto (taxa, gestão de agentes, carteira, Federation, Docker) e o site
público, adaptado de template com auditoria prévia. Falta **apenas o loop HTTP
do x402**, travado em duas chaves externas.

`SPEC.md` diz o que construir, `PRD.md` por quê, `TESTING.md` como testar, e
este arquivo diz **onde paramos**.

---

## Onde paramos

| Fase / bloco | Estado | Evidência |
|---|---|---|
| 0 · fundação, proving, spike OZ | ✅ | provas 1,6–2,8s; fluxo confidencial ponta a ponta |
| 1 · `ComplianceGate` | ✅ | 15 testes |
| 2 · identidade RWA + `OrgRegistry` | ✅ | 17 testes; stack ERC-3643 no ar |
| 3 · x402 | ⚠️ **parcial** | policy provada on-chain; falta chave externa |
| 4 · gate confidencial | ✅ | `NotAuthorizedByPolicy (3602)` na testnet |
| 5 · tesouraria confidencial | ✅ | 6 testes + 3 skip (`set_spender`) |
| 6 · ativo permissionado `ALPHA` | ✅ | 6 testes; mint e transferência recusados sem claim |
| 7 · auditoria e disclosure | ✅ | 4 testes; auditor designado abre, chave errada não |
| 8 · console e credencial | ✅ | credencial em uma leitura; simulação prevê recusa |
| Taxa de constituição | ✅ | cofre `100000000000 → 100050000000` ao constituir |
| Gestão de agentes | ✅ | admin adiciona/remove; remoção apaga a regra da conta |
| Carteira Freighter | ✅ | rede validada antes de assinar |
| Domínio e subdomínio (SEP-2) | ✅ | `trader*charter.local` resolve na rede |
| Docker x402 | ✅ | compose com vendedor, agente e app |
| Layout do app | ✅ | sistema visual próprio, claro e escuro |
| Site público (`/`) | ✅ | landing em inglês; seção técnica carrega o pitch |
| Porta de entrada com carteira | ✅ | caixa modal antes de qualquer rota do app |
| Aplicação em inglês | ✅ | telas, formulários e mensagens de recusa |

**Testes: 43 de contrato · 60 de componente · 10 contra a testnet.**

```bash
cd contracts && stellar contract build && cargo test && cd ..   # 43
pnpm test                                    # integração dos contratos
pnpm --filter @charter/web test              # 60 de componente (mock, rápidos)
pnpm --filter @charter/web test:write        # 10 contra a testnet (chain + write)
```

Os skip declarados: 3 de `set_spender` (o SDK não tem witness builder) e 2 de
disclosure interativa (exige o fluxo da página `/verify`; a criptografia já tem
19 testes no SDK).

---

## Próximo passo imediato

**Fechar o loop HTTP do x402.** Servidor, agente e containers estão prontos;
faltam as duas chaves externas (§Bloqueios). Depois: ensaiar a demo ponta a
ponta e **gravar o vídeo**, que o SPEC trata como seguro contra a apresentação
ao vivo falhar.

Antes de gravar, resolver os dois itens de §Pendências de apresentação — o
primeiro deles é visível em qualquer print da home.

---

## Armadilha nº 1 para quem retomar

**`CHARTER_CONTEXT_RULE_ID` precisa ser `1`, não `0`.**

A conta corporativa nasce com a regra do administrador no índice 0
(`Signer::Delegated(fundador)`, escopada à própria conta); os agentes começam em
1. Um índice errado aqui **não falha visivelmente** — a operação simplesmente
assina sob a procuração errada. Está em `deployments/testnet.json`
(`charter.traderContextRuleId`) e no `.env.demo`.

Se reimplantar os contratos, conferir esse valor antes de qualquer outra coisa.

---

## O evento

**Stellar Summit São Paulo 2026**, submissão via **GrantFox**
(`bounties.grantfox.xyz`; docs em `docs.grantfox.xyz`, ambos exigem login).

Lanes oficiais: **Privacy (OpenZeppelin + Nethermind)**, **Anchors and Ramps
(Etherfuse)**, **Payments and Agent Tooling (SDF DevEx)**, **Content & Docs**.
O Charter cobre duas:

| Lane | O que entrega |
|---|---|
| Privacy | Confidential Tokens + `KybPolicy`, folha com valores ocultos, auditor designado |
| Payments and Agent Tooling | Smart account com policy signer, recusa on-chain, `OrgRegistry`, console |

**Pré-requisitos da plataforma — dependem só de ação humana:**
1. **KYC verificado.** Depende de terceiro e pode levar dias; é o único item do
   projeto sem plano B.
2. **Wallet conectada** (Freighter, Albedo ou WalletConnect).

**Ainda desconhecido:** prazo, valores e critérios de julgamento — só aparecem
logado. Vale conferir se as *bounties* têm escopo fechado: as descrições que
temos são de sub-lane ("examples of what you can build"), e uma bounty com
requisitos próprios pode não casar com o que foi construído.

**Primitiva não explorada:** *Stellar Private Payments* (SPP, Nethermind) —
privacy pool com Circom/Groth16, esconde **quem paga quem**. Complementar aos
Confidential Tokens, que escondem **quanto**. Para tesouraria corporativa a
escolha atual é a correta: numa folha de pagamento as partes devem ser
identificáveis pelo auditor e só o valor precisa ficar oculto. Anonimato de
grafo seria o oposto do que compliance pede — resposta pronta para o Q&A.

---

## Bloqueios que dependem de ação humana

1. **x402 — `OZ_API_KEY`**: gerar em <https://channels.openzeppelin.com/testnet/gen>
   (formulário web). Sem ela o vendedor recusa a inicialização — de propósito.
2. **x402 — USDC de testnet**: <https://faucet.circle.com/> (captcha), mais
   trustline de USDC nas duas contas.
   Com as duas: `docker compose up --build` e `docker compose run --rm agente`.
3. **Notion do evento**: já lido e resumido acima.
4. **MCP `stellar-raven`**: autenticar com `/mcp` → Authenticate.

---

## Limitação técnica confirmada

**`set_spender` (procuração confidencial) não é implementável com o SDK atual.**
O circuito existe e a VK está registrada, mas o `@ctd/sdk` não expõe witness
builder — não há como montar a prova pelo cliente. Escrevê-lo do zero, para
circuito de terceiros e sem especificação dos inputs, é risco desproporcional.
Três testes ficam `skip` com o motivo à vista.

Consequência para o pitch: a procuração confidencial por agente sai da demo.
Ficam o Fluxo E (folha com valores ocultos) e o Fluxo F (revogação de claim
recusando a operação seguinte) — ambos funcionando.

---

## Fatos operacionais que custaram tempo

Estão nos comentários do código; repetidos aqui porque economizam horas.

**Contratos**
- **`spending_limit` exige `ContextRuleType::CallContract`** (erro 3227): o teto
  é sempre por contrato-alvo, nunca global.
- **Signers de smart account assinam `sha256(payload ‖ context_rule_ids)`**, não
  o payload do host.
- **`install` e `enforce` na mesma frame de teste** dão `Error(Auth,
  ExistingValue)`. Blocos `as_contract` separados, como faz a OZ.
- **`add_context_rule` exige auth da conta numa sub-invocação**: nos testes,
  `mock_all_auths` sozinho recusa com `Error(Auth, InvalidAction)` — é preciso
  `mock_all_auths_allowing_non_root_auth`.
- **`symbol_short!` aceita no máximo 9 caracteres**; acima disso, `Symbol::new`.

**Ferramentas**
- **O CLI grava `None` em `Option<Address>` sem avisar.** O primeiro token
  confidencial subiu sem gate nenhum. Todo deploy com parâmetro opcional confere
  a config depois — `scripts/deploy-gated-token.mjs` faz isso.
- **O CLI não serializa struct em campo `Val` livre.** Vale para `add_identity`
  (`Vec<Val>` de `CountryData`) e para os parâmetros das policies. Esses deploys
  vão por script JS montando ScVal.
- **pnpm**: `packageManager` fixado em `pnpm@11.8.0` porque a versão 10 lê a
  aprovação de build script do `package.json` e a 11 do `pnpm-workspace.yaml`.
  Dentro do Docker, `--config.dangerouslyAllowAllBuilds`.

**Confidencial**
- **Raiz das chaves precisa ser determinística.** O opening `(v, r)` vive só no
  cliente; com raiz aleatória o saldo anterior fica inacessível e o registro
  on-chain vira lixo (`InvalidProof`). As contas `treasury`/`vendor1` foram
  queimadas assim; as boas são `tesouraria` e `fornecedor`.
- **Proving repetido no mesmo processo trava.** Uma execução ficou 900s sem
  saída. Onde `deposit`/`merge` provam a mesma coisa, usar eles.
- **`CircuitProver` precisa de `destroy()`** — os worker threads do UltraHonk
  seguram o event loop.
- **Evento de transação não sai mais do meta.** No protocolo 23+ o meta é
  `TransactionMetaV4` e `meta.v3()` levanta `v3 not set`. Os eventos vêm em
  `tx.events.contractEventsXdr`, e `contractId()` ali é hash cru:
  `StrKey.encodeContract`, não `Address.fromScAddress`.

**Frontend**
- **`client.rpc` não existe** no `@ctd/sdk` — é `client.latestLedger()`.
- **`page.tsx` do Next não aceita props customizadas**: componentes testáveis
  ficam em `components/`, a página é uma casca.
- **A simulação só executa `__check_auth` com as auth entries assinadas.** Sem
  assinar, a previsão sai falsamente otimista — e uma previsão que sempre diz
  "vai passar" é pior que nenhuma.
- **`server-only` bloqueia o import nos testes** (e deve mesmo). Aliasado para
  um stub em `test/stubs/`, com `write.test.ts` rodando em ambiente node.
- **Vídeo de fundo com trilha de áudio não dá autoplay.** O hero parecia
  imagem estática: navegador bloqueia `autoplay` quando o MP4 tem faixa de
  áudio, mesmo com `muted` no HTML. Corrigido com `video.muted = true`
  imperativo e `play()` com catch; o certo é reencodar o asset (`ffmpeg -an`).
- **`.env.demo` só aceita `CHAVE=valor` sem espaços.** Um append antigo gravou
  mensagem de erro do CLI como valor, o `source` quebrou no meio e variáveis
  ficaram de fora — o sintoma foi `Error(Auth, InvalidAction)` em vez de `4003`.

---

## Chaves e endereços

Endereços em `deployments/testnet.json` e `deployments/identity-testnet.json`.

**Não versionados, necessários para continuar:**
- `.env.identity` — `ISSUER_SK`, chave do claim issuer. **Sem ela não se emitem
  novos claims**; a saída é subir uma stack nova (`./scripts/bootstrap-identity.sh`).
- `.env.demo` — chaves de assinatura e endereços correntes. `.env.example`
  documenta cada campo.

Identidades no `stellar` CLI: `admin` (deployer e fundador), `cofre` (recebe a
taxa), `supplier` e `stranger` (verificado / não verificado), `tesouraria` e
`fornecedor` (contas confidenciais boas), `agent-trader` e `agent-auditor`
(carteiras dos agentes), `treasury` e `vendor1` (**queimadas**).

Emitir claim para conta nova: `./scripts/issue-claim.sh <alias>`.

---

## Comandos

```bash
# contratos
cd contracts && stellar contract build && cargo test && cd ..

# aplicação
pnpm web                       # Next.js em :3000
pnpm --filter @charter/web test

# demos que funcionam hoje
node scripts/agent-payment-demo.mjs      # dentro da política liquida, fora é recusado
node scripts/confidential-gate-demo.mjs  # com claim passa, sem claim → 3602
node scripts/payroll-demo.mjs            # folha com valor oculto
node scripts/create-org.mjs              # constitui e paga a taxa

# infraestrutura
./scripts/bootstrap-identity.sh          # sobe a stack ERC-3643 do zero
./scripts/issue-claim.sh <alias>         # emite claim KYB
node scripts/deploy-gated-token.mjs <kybPolicy>

# containers (precisa das chaves do x402)
docker compose up --build
docker compose run --rm agente
```

---

## Pendências de apresentação

Nenhuma trava a demo; as duas primeiras aparecem na tela.

1. **`metrics-section` anima números inventados** (12847392 / 99 / 340),
   herdados do template. Numa página cujo argumento é verificabilidade, número
   fabricado é o detalhe que um jurado nota. Ou vira leitura real da testnet
   (`OrgRegistry` sabe quantas orgs e agentes existem), ou sai.
2. **URLs em português na aplicação** — `/constituir`, `/o/[org]`, `/org/[org]`.
   O texto todo está em inglês; a barra de endereço não. Renomear rota exige
   ajustar os `destino` da landing e os links do `Chrome`; sem ganho funcional,
   só de coerência.
3. **`/painel` é órfã.** Era a home antes do site; hoje ninguém linka para ela.
   Traduzida junto com o resto para não deixar português acessível, mas o certo
   é apagar ou redirecionar para `/`.

---

## Como funciona a porta de entrada (mexeu duas vezes, vale registrar)

Todo CTA do site que leva a uma tela de assinatura passa por
`web/components/landing/entrar-no-app.tsx`. A credencial pública (`/o/…`) é a
única saída deliberadamente livre: quem consulta um agente ainda não é cliente.

**O que confundiu antes:** quando o Freighter já autorizou o site,
`requestAccess()` devolve o endereço **sem abrir pop-up**. A navegação
acontecia num piscar e parecia que não havia verificação nenhuma. A decisão
atual é mostrar a caixa **sempre** — sem permissão ela pede conexão, com
permissão ela confirma e exibe o endereço que vai assinar.

A distinção entre "instalado" e "autorizado" vem de `getAddress`, que devolve
endereço **vazio** enquanto o site não tem permissão. É o único jeito de
descobrir isso sem abrir pop-up, e a barra do app (`conectar-carteira.tsx`) usa
a mesma sonda ao montar — sem ela, quem acabou de autorizar via "Connect
wallet" de novo no Console.

---

## Dívidas conhecidas

- **`charter-signer` existe em `.mjs` e `.ts`** — mesmo algoritmo, duas
  linguagens. O `.mjs` serve os scripts em Node puro; o `.ts`, as rotas do app.
  Se um mudar sem o outro, demo e aplicação divergem. Estão marcados como gêmeos
  no cabeçalho.
- **As chaves assinam no servidor** nas rotas de escrita. Para a demo é o certo
  (a apresentação não trava numa extensão); em produção o `POST /api/org` seria
  assinado no browser. O componente de carteira já está pronto e testado.
- **A stack de identidade tem issuer mock.** O registry é o trilho; o issuer
  real seria um anchor SEP ou provedor de KYB.
- **Identificadores em português, interface em inglês.** Arquivos e variáveis
  (`conectar-carteira.tsx`, `endereco`, `erro`) seguem a convenção do código;
  só o texto de tela foi traduzido. Renomear seria churn sem ganho para quem
  usa — mas é uma inconsistência que quem chegar ao repo vai notar.
