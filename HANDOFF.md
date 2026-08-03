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
| 8 · console e credencial | ✅ | console removido; feed e ranking na gestão da org |
| Taxa de constituição | ✅ | cofre `100000000000 → 100050000000` ao constituir |
| Gestão de agentes | ✅ | add/remove provados na testnet após o redeploy |
| Carteira Freighter | ✅ | rede validada antes de assinar |
| Patrocínio de taxa | ✅ | agente assina, fundador paga; provado na testnet |
| Constituição assinada pelo fundador | ✅ | `matrix` criada na testnet pela carteira do usuário |
| Minhas organizações (`/orgs`) | ✅ | nomes do histórico, agentes de `org_of` |
| Console e credencial por carteira | ✅ | `seletor-org` resolve; `alphafund` saiu dos padrões |
| Área de administração (`/admin`) | ✅ | emite claim KYB; portão por desafio assinado |
| Domínio e subdomínio (SEP-2) | ⚠️ **parcial** | resolve; devolve `C…` onde o SEP-2 espera `G…` — ver §SEP-2 |
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

## Teto do agente e saque — redeploy de 03/08/2026 (2º)

Duas coisas que faltavam para o fundador não ficar refém da própria organização.

**Teto acumulado por agente** (`GateParams.max_volume`, `Option<i128>`).
`kyb_threshold` diz **de quem** se exige identidade; nunca limitou valor. Sem
teto, uma procuração válida drena o tesouro em operações individualmente
irrepreensíveis. `None` é sem teto — o que as procurações antigas eram, e o
padrão de quem não escolher. Recusa com **4006**.

O teto é **alterável pelo fundador**: `OrgRegistry.set_agent_limit(name, label,
Option<i128>)` exige `founder.require_auth()` na raiz e chama
`ComplianceGate.set_max_volume`. O gate descobre quem pode mandar **perguntando
à conta**: `ContaClient::gestor()` e então `require_auth()` nele. Contrato para
contrato, sem `__check_auth` no caminho — o mesmo padrão que destravou
add/remove.

**Saque do tesouro.** `CharterAccount.sacar(token, para, valor)` autorizado pelo
gestor, exposto como `OrgRegistry.withdraw(name, token, para, valor)` com auth do
fundador. A conta é quem chama o token, e um contrato autoriza as próprias
sub-invocações.

Isto **muda a história de segurança** e vale dizer em voz alta: antes, a regra
do administrador era escopada à própria conta justamente para que administrar
não desse via livre ao tesouro. Agora o fundador tem uma saída. É correto — o
dinheiro é dele, e uma organização sem saída deixaria o saldo preso —, mas
significa que o fundador **pode** esvaziar o tesouro. Quem não é fundador,
não.

Provado na testnet:

| Caso | Resultado |
|---|---|
| `set_agent_limit` para 10 XLM | teto passa de `null` para `100000000` |
| agente move 6 XLM | liquida |
| agente move mais 6 XLM (soma 12) | recusado com **4006** |
| `withdraw` de 15 XLM | 500000000 → 350000000 |

**Endereços novos** (o anterior fica órfão, e as organizações nele também):
registro, gate e wasm da conta mudaram — ver `deployments/testnet.json`.

---

## Tesouro da organização — o que confunde

São **duas** coisas diferentes, e trocá-las custa tempo de depuração:

| | Quem paga | Onde vive |
|---|---|---|
| **taxa** da transação | o patrocinador (fundador) | conta `G…` dele |
| **valor** que o agente move | o tesouro da organização | conta corporativa `C…` |

Uma organização recém-constituída tem saldo **zero**. A procuração do agente
está perfeitamente válida e a transferência falha assim mesmo, com erro do token
que não menciona saldo. O componente `Tesouro` (em `/org/[org]`) mostra o saldo
e deixa o fundador aportar; o texto da tela diz explicitamente que aquilo não é
a taxa, porque essa foi a confusão real.

A conversão XLM↔stroops fica em `lib/valores.ts` e é feita **em texto**:
`Number("8.1") * 1e7` devolve `81000000.00000001`, e arredondar o resto é como
se perde ou se cria dinheiro sem ninguém notar. Valor com mais de 7 casas é
recusado em vez de truncado — mostrar um número e enviar outro é pior que
recusar.

---

## Endereços em uso (03/08/2026, após o último redeploy)

    registro   CAFY6ILDEPSPXQAXC5UEGDA76E3HFRQNJKPNXKDYTCUC2UQX7CXXB4CZ
    gate       CCCFFYPNVPOUVGDZSOYXEPT74YLEJFFGV62AKXVWOPZD3MKXUCXUUU27
    conta wasm 5ee23ec794551db2…
    alphafund  CDLFABDYWQABKEYXQEASC5PZQNPUDC5FHZGVPEKGZUQ6W2FYK3WLRFWW

O registro foi redeployado **por um motivo só**: liberar o nome `Matrix`. Nomes
são únicos e imutáveis por construção, e a organização antiga ocupava o dele no
registro anterior. Tudo que existia lá ficou órfão — é o preço de recuperar um
nome, e vale saber antes de escolher nomes na apresentação.

`alphafund` foi recriada no gate novo, com a carteira de sempre no `trader` e o
`auditor` sem escopo, e financiada com 50 XLM.

---

## x402 — fechado ponta a ponta

    recurso: 200
    {"pair":"XLM/USD","price":0.4127,...}
    liquidação: {"success":true,
                 "payer":"CDSQS7KJ…",
                 "transaction":"c3d0ec77…"}

O agente comprou o recurso com **XLM**, pagando pela conta corporativa, e o
facilitador da OpenZeppelin liquidou **patrocinando a taxa**. `isValid: true`,
com o `payer` sendo a smart account.

**O que precisou mudar, e por quê.** O `ComplianceGate` emitia `PolicyDecision`.
O validador do facilitador percorre **todos** os eventos de contrato da simulação
e recusa qualquer um cujo primeiro tópico não seja o símbolo `transfer` — não
ignora, recusa. Instrumentação nossa custava interoperabilidade, e a garantia
nunca esteve no evento: quem recusa é o `panic`, que reverte a transação. O
evento saiu, e um teste guarda a invariante — `o_caminho_aprovado_nao_emite_evento`.

O feed do console foi refeito **antes** do redeploy, lendo os `transfer` do
próprio ativo filtrados pela conta corporativa. Perdeu a atribuição por agente
em cada linha; ela vive no `AgentStats`, que alimenta o ranking.

**O registro não foi redeployado.** `create_org` recebe o gate por organização,
então só o gate mudou de endereço. Organizações antigas seguem no gate anterior
— e continuam emitindo evento, logo continuam incompatíveis com o x402. Para
usar o padrão, **recriar a organização**.

**Armadilhas que custaram tempo, em ordem:**

| Sintoma | Causa |
|---|---|
| 401 em `/x402/supported` | o caminho é `/x402/testnet/supported` |
| tudo vira USDC | `price: "$0,001"` converte; ativo próprio vai como `price: { amount, asset }` |
| 401 com a chave certa no arquivo | valor entre aspas: `source` do bash tira, leitor JS não |
| 402 com corpo `{}` | as exigências vêm no cabeçalho `PAYMENT-REQUIRED`, em base64 |
| `payload_malformed` | falta o campo `accepted` no payload |
| `auth_expiration_too_far` | validade acima de `maxTimeoutSeconds / 5` ledgers |
| `fee_exceeds_maximum` | taxa base alta; usar o mínimo e deixar o preparo somar |
| `event_not_transfer` | o `PolicyDecision` do gate |

**Uma consequência de desenho:** o facilitador e o patrocínio próprio são rotas
**alternativas**. A auth entry tem nonce de uso único — quem liquidar primeiro a
consome, e a outra falha na simulação. Não é escolha nossa; é o antirreplay do
Soroban.

---

## `getEvents` — duas armadilhas que devolvem lista vazia sem erro

O feed apareceu vazio enquanto o ranking mostrava duas operações. As causas
foram duas, e nenhuma dá erro:

1. **O SAC emite `transfer` com quatro tópicos** — o quarto é o nome do ativo.
   Um filtro de três segmentos nunca casa.
2. **A RPC varre um trecho limitado de ledgers por consulta.** Começar longe faz
   ela parar antes de alcançar os recentes: uma janela de 100 mil ledgers não
   mostrava operações de minutos atrás, enquanto 5 mil mostrava. **Janela maior
   devolve menos.**

`getHealth` informa `oldestLedger` e `ledgerRetentionWindow`, mas eles descrevem
retenção de **ledgers**, não o alcance de uma consulta de eventos — seguir por
ali leva à conclusão errada. O feed usa 5 000 ledgers, cerca de sete horas.

---

## O console foi removido — o que foi de cada peça

Tinha três cartões, e cada um teve destino diferente:

- **Pagamento do agente** → apagado. Assinava com a chave do agente **no
  servidor**, o que contradiz o modelo de cada agente ter a própria, e
  `src/charter-simulacao.mjs` faz o mesmo caminho do jeito certo.
- **Feed de operações** → `/org/{org}`. É onde o fundador administra, e "o que
  minha organização fez" pertence ali.
- **Ranking por conduta** → `/org/{org}`, pelo mesmo motivo.

As rotas `/api/pagamento` e `/api/pagamento/simular` **continuam existindo** e
são exercitadas por `write.test.ts` contra a testnet — é a prova mais forte do
repo de que a recusa acontece on-chain (`4003`). Nenhuma tela as usa.

---

## Charter Simulation — o roteiro assistido do terminal

`pnpm simulacao` (ou `node src/charter-simulacao.mjs`). Seis passos, cada um
pedindo confirmação: escolher agente, chamar o vendedor x402, assinar, mandar ao
patrocinador, apresentar a prova, concluir.

É assistido de propósito. Um script que faz tudo de uma vez esconde justamente o
que interessa mostrar — que o agente **autoriza** em vez de ordenar, e que quem
paga a taxa é outra carteira.

**A lista de agentes vem da cadeia**, não de constante: o script lê `org_of`,
mostra os agentes reais da organização e procura `AGENT_<NOME>_SECRET` para
cada. O id da procuração também é descoberto pelo nome da regra — depender de um
número no `.env` seria convidar o erro silencioso de assinar sob a regra do
administrador.

**Modo ensaio.** Sem `OZ_API_KEY` não há vendedor, e o script oferece uma
exigência montada localmente, **rotulada como tal na tela**. Serve porque a tese
do produto está nos passos 3 e 4 — assinatura do agente, decisão da procuração,
patrocínio da taxa — e nenhum deles depende do x402. Provado assim na testnet
com `alphafund`: assinatura sob a regra 1, procuração aprovando, liquidação em
`0b3a66a3…`.

O que ainda exige as chaves externas: o passo 2 contra um vendedor de verdade e
o passo 5 no facilitador. Chaves em `.env.simulacao`; veja
`.env.simulacao.example`.

---

## Patrocínio de taxa — o agente assina, o fundador paga

O agente carrega a chave que **autoriza** e nada além disso: sem XLM, sem conta
financiada, sem existir na rede. O que ele produz é uma
`SorobanAuthorizationEntry` assinada. Quem paga a taxa é o patrocinador, que não
tem poder algum sobre o tesouro — a conta corporativa só se move com a
assinatura do agente, dentro da procuração dele.

    src/agente-patrocinado.mjs   →  POST /api/patrocinio  →  rede

**A decisão de segurança:** o patrocinador **remonta a operação** a partir de
campos tipados (organização, destinatário, valor) e nunca executa calldata
recebida. Um patrocinador que assina o que mandarem é torneira de taxa e, pior,
oráculo de execução para qualquer contrato. Se a remontagem diferir do que o
agente assinou, a autorização falha on-chain — não há como enganar os dois lados
ao mesmo tempo. O pior caso de um pedido forjado é o patrocinador desperdiçar a
própria taxa.

**Por que o agente simula duas vezes.** A primeira sonda roda *sem* autorização,
e a policy só executa quando as auth entries estão presentes — ela é otimista
por construção. A segunda, já com o que foi assinado, é a que revela a recusa
real com o código do contrato. Sem ela o agente manda uma transação destinada a
reverter e o patrocinador paga para descobrir; a recusa chega como
`Error(Auth, InvalidAction)`, que não diz nada a ninguém.

Provado na testnet, com `alphafund` (fundador = admin = patrocinador):

| Caso | Resultado |
|---|---|
| 100 e 250 para contraparte verificada | liquidado, taxa paga pelo fundador |
| 900 para contraparte **sem** claim | recusado com 4003, antes de gastar taxa |
| 900 para contraparte com claim | liquidado |
| assinatura sob a regra do administrador (0) | recusado |

**Para trocar de organização:** `SPONSOR_SECRET` é a chave de quem paga (deve
ser o fundador daquela organização), e o agente recebe `AGENT_SECRET` mais o id
da regra. O id não é adivinhável: a regra 0 é sempre do administrador, e os
agentes começam em 1, na ordem da constituição.

---

## SEP-2 — o que está provado e o que não está

**Como o nome entra numa transação.** O front resolve **antes** de montar
qualquer coisa (`lib/enderecos.ts`), mostra o endereço na tela, e o que vai para
a carteira e para a cadeia é sempre o endereço. Não é conveniência: contrato
Soroban não entende nome, então mandar um significaria alguém traduzindo por
dentro sem quem assina ver o quê. Aceitam nome federado hoje: o destinatário do
pagamento no console e a conta a verificar em `/admin`.

**Provado:** `/.well-known/stellar.toml` publica o servidor e a passphrase da
rede; `/federation?q=…&type=name` resolve `agente*organização*domínio` para a
conta corporativa, e `founder*organização*domínio` para quem constituiu. Agente
removido deixa de resolver, porque a resolução passa por `credentials_of` e
confere `active`. Um agente chamado `founder` tem precedência sobre a
convenção — dado do registro vence convenção nossa.

**Não provado, e o HANDOFF afirmava que sim:** a frase "qualquer carteira
Stellar resolve e paga o agente sem conhecer o Charter". O SEP-2 chama o campo
de `account_id` e as carteiras esperam um **`G…`**; devolvemos um **`C…`**,
porque quem assina é um contrato. O SEP-2 é anterior aos contratos Soroban.
Nenhuma carteira de terceiro foi testada contra este endpoint.

Consequências práticas, em ordem:

1. **No pitch, não prometer pagamento por carteira de terceiro.** Dizer que o
   nome resolve e que a resolução reflete revogação — isso é verdade e
   verificável ao vivo com `curl`.
2. Para o fluxo de pagamento real, o caminho é o agente assinando via
   `charter-signer`, que já funciona.
3. `founder*org*domínio` devolve `G…` e **é** consumível por qualquer
   ferramenta — é a única resposta nossa que cabe no formato original.

**Onde `CHARTER_DOMAIN` importa:** sem ele, o domínio vem do host da requisição,
o que serve para desenvolvimento e quebra atrás de proxy.

---

## Área de administração (`/admin`) — emissão de claim KYB

Fora da navegação de propósito. **Não listar não é segurança**: quem sabe a URL
chega lá. O que protege é o portão da rota, e a página diz isso.

**Por que existia o problema.** `credentials_of` calcula `org_verified` com
`verify_identity(org.founder)` — o **fundador**, não a conta corporativa. O
`bootstrap-identity` emitiu claims para as *contrapartes* (`supplier`), que é o
que o gate de pagamento consulta em `4003`, e nenhum fundador foi registrado.
Resultado: toda credencial da demo mostrava "organização não verificada",
`alphafund` inclusive. O comportamento estava certo (fail-closed); faltava o
claim.

**Endereço federado.** O campo aceita `founder*Matrix*domínio` além do `G…`
cru, e mostra o endereço resolvido antes de emitir. Existe porque o alvo certo é
o **fundador**, e a conta corporativa é a que aparece em toda parte — copiar a
errada gera uma emissão válida para o endereço errado, com o selo continuando
negativo sem dizer por quê. O que vai para a cadeia é sempre o endereço
resolvido, nunca o apelido.

**Quem pode abrir a tela ≠ qual chave assina.** `ADMIN_SECRET` é a autoridade
on-chain do identity registry — a stack subiu com `--admin admin --manager
admin`, e trocá-la faria o registro recusar as emissões. Já *quem pode pedir*
uma emissão é conferência de endereço, sem chave no servidor. `PLATFORM_ADMIN`
separa os dois: definida, o portão passa a exigir aquela carteira; ausente, cai
na chave do servidor, que é o comportamento de antes.

Enquanto ela não for definida, operar `/admin` exige ter `ADMIN_SECRET` na
carteira — o que na testnet é aceitável e em produção não seria: essa chave é
também deployer, patrocinador e fundadora da `alphafund`.

**O portão é assinatura de transação, no desenho do SEP-10.** `GET
/api/admin/desafio` devolve uma transação com **sequência 0** — impossível de
submeter —, a carteira a assina, e `POST /api/admin/kyb` confere a assinatura
contra o hash antes de ler o resto do corpo. Vale uma vez e expira em 5 min.

**`signMessage` foi tentado primeiro e custou cinco rodadas.** A biblioteca do
Freighter só repassa o blob para a extensão, e é ela que decide o que assinar;
foram tentadas sete formas (bytes crus, base64, sha256 de cada, prefixo
"Stellar Signed Message") e nenhuma bateu. A lição não é sobre o Freighter: era
um ponto de integração que eu **não conseguia verificar daqui**, e cada correção
virava um chute com ciclo de ida e volta pelo usuário. Assinatura de transação
não tem ambiguidade — o payload é o hash, definido pelo protocolo — e já era o
caminho provado nesta carteira pela constituição, aporte e saque.

**Armadilha achada rodando:** o Next empacota **cada rota separadamente**, então
o `Map` de desafios pendentes era instanciado uma vez por rota — o nonce criado
em `/desafio` não existia em `/kyb`, e o portão recusava todo mundo com "desafio
desconhecido", parecendo erro de assinatura. Vive em `globalThis` por isso.

**A emissão** (`lib/kyb.ts`) é o porte de `scripts/issue-claim.sh`, com uma
diferença: o script implantava o contrato de identidade com `--source <alias>`,
exigindo a chave secreta do sujeito no CLI. Uma carteira de usuário vive no
Freighter. Aqui o admin paga o deploy e fica como `owner`, e o registro mapeia a
conta do sujeito àquela identidade. **Para a demo é o papel do emissor; num
sistema real o sujeito deveria controlar a própria identidade** — a tela diz
isso ao usuário, não só este arquivo.

A assinatura do claim foi portada para TypeScript (`lib/claim-kyb.ts`) porque
depender de `cargo run` dentro de uma rota HTTP exigiria a toolchain Rust no
servidor. O porte é conferido contra o binário: o teste pega a saída real do
`sign-claim` e **verifica aquela assinatura com a mensagem reconstruída em JS**.
Um byte fora de ordem reprova.

Emitido na testnet para os dois fundadores:

| Conta | Identidade | Resultado |
|---|---|---|
| `GAFASLN5…` (fundador de `matrix`) | `CDCHFY54…` | verificado |
| `GBBH2YAT…` (fundador de `alphafund`) | `CCYBUUIE…` | verificado |

Ambas as credenciais mostram **organization verified**. Reemitir é idempotente:
a rota consulta antes e devolve `jaEstava`, sem criar segunda identidade.

---

## O registro não enumera — e por que `/orgs` lê o histórico

`RegistryStorageKey` tem `Org(Symbol)` e `Agent(Symbol, Symbol)`: consulta por
nome, nunca enumeração. Não há índice por fundador nem evento de criação. As
consequências apareceram juntas quando a primeira organização foi criada pela
interface:

- quem constituía não reencontrava a própria organização — o console apontava
  para `NEXT_PUBLIC_ORG ?? "alphafund"`;
- os rótulos de agente eram um padrão fixo no código (`trader,auditor`), então
  um agente chamado `Neo` não existia para a interface.

**`org_of(name) -> OrgInfo` já existia** e devolve `founder`, `account` e
`agents`. O padrão fixo era desnecessário desde sempre: o registro sabe quem são
os agentes. Toda leitura de rótulo passou a vir daí — credencial pública,
ranking, console e painel de gestão.

O que o registro **não** sabe é quais organizações pertencem a uma carteira.
Para isso, `lib/minhas-orgs.ts` reduz as operações da conta no Horizon: toda
constituição é um `create_org` assinado pelo fundador, com o nome nos
argumentos. A divisão ficou assim, e importa:

| Pergunta | Fonte |
|---|---|
| quais organizações são desta carteira | histórico da conta (Horizon) |
| quem são os agentes **agora** | `org_of` no registro |

O histórico mostraria quem havia na constituição, mesmo que já removido.

O parser é puro e tem 9 testes; a busca fica separada. Ele acumula `add_agent`,
desconta `remove_agent`, descarta transação revertida e ignora invocações de
outros contratos — sem esse filtro, qualquer contrato com uma função de mesmo
nome entraria na lista do usuário.

**Limite honesto:** se o Horizon consultado tiver janela de retenção curta,
organizações antigas somem da *descoberta*. Continuam existindo e acessíveis
pelo nome. A correção definitiva é o registro emitir evento em `create_org` —
vale juntar ao redeploy proposto abaixo.

---

## Auth fora da raiz — resolvido pelo redeploy de 03/08/2026

**O problema.** `add_agent`/`remove_agent` passavam pelo `add_context_rule` do
trait da OpenZeppelin, que faz `e.current_contract_address().require_auth()`. A
conta autoriza a si mesma, o que entra no `__check_auth`; a regra do
administrador era `Signer::Delegated(fundador)`, e o `authenticate` da OZ
responde a um signer delegado com `require_auth_for_args` no endereço dele.
Isso é **autorização fora da raiz**: a simulação em modo gravação não a produz,
e o `enforce` recusa. Nunca funcionou na rede — só em `cargo test`, sob
`mock_all_auths_allowing_non_root_auth()`, cujo nome descreve o que a rede não
concede.

**A saída.** `storage::add_context_rule` (a função livre, que o construtor já
usava) **não exige auth nenhuma**. A `CharterAccount` passou a expor
`adicionar_regra`/`remover_regra`, autorizadas pelo **gestor** — o `OrgRegistry`
que a implantou. Autorização de contrato para contrato é concedida ao chamador
direto, sem `__check_auth` no caminho. A garantia não mudou de lugar: o registro
exige `founder.require_auth()` na raiz antes de tocar na conta.

Sinal de que funcionou: os testes do registro passaram de
`mock_all_auths_allowing_non_root_auth()` para `mock_all_auths()` comum — o
mesmo que a rede concede.

**O segundo defeito, achado no caminho.** `Signer::Delegated(carteira)` tem
exatamente o mesmo problema, pelo mesmo motivo. Um agente criado assim nasceria
com procuração válida e **sem conseguir assinar nada** — o mesmo sintoma do bug
das chaves geradas e descartadas, com outra causa. Os agentes voltaram a usar
`Signer::External(verificador ed25519, chave pública)`, com a chave derivada do
próprio endereço `G…`: o administrador continua informando só a carteira, e o
agente assina o auth digest com a própria chave, como `charter-signer` faz.

**Constatação de desenho:** rótulo removido **não pode ser reusado**.
`add_agent` verifica `has(Agent(name,label))`, e o registro do agente revogado
permanece. Reaproveitar um nome exige outra organização.

**`credentials_of` também precisou mudar.** Remover a procuração desinstala a
policy, e o gate deixa de responder por ela — a credencial de um agente
revogado falhava com 4000 em vez de dizer "revogado". Agora usa `try_get_params`
e devolve poderes zerados, que é o que a rede de fato permite a ele. Só apareceu
porque a remoção passou a funcionar.

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

- **`create_org` gerava chaves de agente no servidor e descartava o segredo.**
  A procuração nascia válida e sem ninguém capaz de usá-la. Corrigido: cada
  agente entra com a própria carteira, como já era em `add_agent`.
- **`charter-signer` existe em `.mjs` e `.ts`** — mesmo algoritmo, duas
  linguagens. O `.mjs` serve os scripts em Node puro; o `.ts`, as rotas do app.
  Se um mudar sem o outro, demo e aplicação divergem. Estão marcados como gêmeos
  no cabeçalho.
- **O feed (`/api/feed`) ainda é global**, não por organização: mostra as
  decisões de política que a RPC devolve, sem filtrar pela conta corporativa da
  organização escolhida. O ranking e o pagamento já seguem a seleção.
- **`app/federation/route.ts` serve `CHARTER_ORG ?? "alphafund"`.** Um domínio
  SEP-2 serve uma organização, então o padrão faz sentido — mas continua sendo
  a organização da demo.
- **A landing ainda mostra `/o/alphafund`** em "See a live credential". Ali é
  proposital: é a vitrine para quem chega sem carteira. Se `alphafund` sair do
  ar, esse link precisa de outra organização pública.
- **O pagamento do agente ainda assina no servidor**, com `AGENT_TRADER_SECRET`.
  Ali é o modelo certo: o agente é uma máquina com chave própria, não uma
  pessoa diante de um pop-up. A constituição, que é ato de pessoa, passou a ser
  assinada no browser.
- **A stack de identidade tem issuer mock.** O registry é o trilho; o issuer
  real seria um anchor SEP ou provedor de KYB.
- **Identificadores em português, interface em inglês.** Arquivos e variáveis
  (`conectar-carteira.tsx`, `endereco`, `erro`) seguem a convenção do código;
  só o texto de tela foi traduzido. Renomear seria churn sem ganho para quem
  usa — mas é uma inconsistência que quem chegar ao repo vai notar.
