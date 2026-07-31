# PRD — Charter

**Produto:** infraestrutura de constituição e operação de organizações agentificadas na Stellar.
**Documento:** requisitos de produto. Arquitetura, contratos e plano de execução estão no [`SPEC.md`](./SPEC.md).
**Status:** v1 · escopo v0 = entrega de hackathon (duas trilhas), testnet.

---

## 1. Sumário executivo

Agentes de IA já executam tarefas econômicas, mas não conseguem **existir como sujeito
econômico**: não têm identidade verificável, não têm procuração limitada e não têm histórico
que uma contraparte possa checar. Na prática, quem coloca agentes para transacionar hoje
escolhe entre dois extremos ruins — entregar a chave do tesouro, ou não deixar o agente
transacionar.

**Charter é o cartório e a procuração dos agentes.** Uma organização é constituída em uma
transação: nasce uma conta corporativa programável, cada agente recebe uma procuração com
teto, escopo e prazo, e um registro de identidade com claims governa quem pode receber valor.
A partir daí, toda operação — micropagamento público, folha de pagamento confidencial ou
transferência de ativo regulado — passa pelo protocolo, não por um servidor que a contraparte
precisa confiar.

**Por que agora:** as três peças necessárias amadureceram na Stellar em 2026 — smart accounts
com policies (OZ `stellar-accounts`), identidade/claims no padrão ERC-3643 (OZ RWA) e tokens
confidenciais com provas verificadas on-chain (developer preview). Nenhuma outra rede tem as
três juntas com finalidade de 5s e taxa de fração de centavo.

---

## 2. Problema

| Dor | Quem sente | Como resolvem hoje | Por que é ruim |
|---|---|---|---|
| Agente precisa de chave para pagar | Time que opera agentes | Chave compartilhada em variável de ambiente | Prompt injection vira drenagem do tesouro; sem limite, sem revogação, sem rastro |
| Não dá para contratar um agente desconhecido | Empresa contraparte | Não contrata, ou faz contrato bilateral off-chain | Bloqueia comércio agente-a-agente; não escala |
| Pagamento corporativo expõe valores | Tesouraria, RH | Sai da blockchain | Perde liquidação programável; ou expõe folha salarial ao público |
| Ativo regulado circula para qualquer um | Emissor | Whitelist manual off-chain | Não é enforcement, é processo; não sobrevive a auditoria |
| Compliance é declaração, não garantia | Compliance officer | PDF, planilha, promessa | Não é verificável por terceiro |

**Insight central:** as cinco dores são a mesma pergunta em contextos diferentes — *quem pode
mover valor, até quanto, para quem, e quem tem direito de ver.* Um único registro de
identidade com claims responde às quatro partes.

---

## 3. Usuários

| Persona | Objetivo | Sucesso para ela |
|---|---|---|
| **Fundador / operador** da org agentificada | Colocar agentes para operar sem expor o tesouro | Constituiu a org em minutos; dorme tranquilo sabendo o teto de perda |
| **Agente** (software) | Pagar serviços e receber valor autonomamente | Paga uma API sem intervenção humana e sem possuir XLM |
| **Compliance officer / auditor** | Provar controle sem virar gargalo | Emite e revoga claims; vê valores que o público não vê |
| **Contraparte** (empresa ou outro agente) | Decidir se aceita negociar | Verifica procuração e verificação em **uma** consulta |
| **Investidor / detentor de cota** | Deter ativo regulado com garantia de circulação restrita | Recebe cota sabendo que ela não vaza para não verificados |

**Persona primária do v0:** fundador/operador. É quem constitui, configura e demonstra.
**Persona de validação:** contraparte — se ela não consegue decidir sozinha, o produto não fecha.

---

## 4. Jobs to be done

- *Quando* eu coloco um agente para transacionar, *quero* limitar o estrago máximo que ele pode causar, *para que* um comprometimento seja um incidente e não uma falência.
- *Quando* recebo uma proposta de um agente desconhecido, *quero* verificar poderes e idoneidade sem confiar no operador dele, *para que* eu possa negociar com quem nunca vi.
- *Quando* pago minha folha on-chain, *quero* que os valores fiquem privados mas auditáveis, *para que* eu não escolha entre eficiência e confidencialidade.
- *Quando* emito um ativo regulado, *quero* que a restrição de circulação seja aplicada pela rede, *para que* conformidade seja garantia e não processo.

---

## 5. Proposta de valor e diferenciação

| Alternativa | Limite | Charter |
|---|---|---|
| Chave compartilhada com o agente | Sem teto, sem escopo, sem revogação | Procuração com teto, escopo de função e prazo, aplicada pela rede |
| Backend custodial com limite de gasto | Quem controla o servidor controla a chave; contraparte precisa confiar | Enforcement no protocolo; verificável por terceiro sem confiar no operador |
| Agent wallets existentes (ex.: Soneso) | Delegação individual agente↔operador, com humano aprovando | Camada **organizacional**: identidade, claims, credencial pública, três espaços de transação |
| Whitelist off-chain para ativo regulado | Processo, não garantia | Claims on-chain consultados a cada operação |

**Diferenciação em uma frase:** somos os únicos onde **o mesmo registro de identidade governa
o pagamento público do agente, a liquidação confidencial da tesouraria e a transferência do
ativo regulado.**

---

## 6. Requisitos funcionais

Prioridade: **P0** = sem isso não há produto (nem submissão) · **P1** = necessário para a
história completa · **P2** = desejável.

### E1 — Constituição da organização

| ID | Requisito | Pri | Critério de aceite |
|---|---|---|---|
| RF-1.1 | Constituir organização com nome, agentes, papéis, tetos e escopos via formulário | P0 | Uma transação cria conta corporativa configurada; hash verificável no explorer |
| RF-1.2 | Cada agente recebe label legível (`trader*alphafund`) resolvível para endereço | P0 | `resolve` retorna o endereço; agente revogado faz `resolve` falhar |
| RF-1.3 | Revogar agente a qualquer momento | P0 | Após revogação, a operação seguinte do agente é recusada |
| RF-1.4 | Registrar conta confidencial da tesouraria com auditor designado | P1 | Conta registrada; `auditor_id` vinculado |

### E2 — Procuração do agente (camada pública)

| ID | Requisito | Pri | Critério de aceite |
|---|---|---|---|
| RF-2.1 | Teto de gasto por período por agente | P0 | Operação acima do teto é recusada on-chain |
| RF-2.2 | Allow-list de funções por agente | P0 | Agente auditor tentando `transfer` é recusado com erro tipado |
| RF-2.3 | Allow-list de contratos-alvo | P0 | Chamada a contrato fora da lista é recusada |
| RF-2.4 | Prazo de validade da procuração | P1 | Após o prazo, operação é recusada sem intervenção manual |
| RF-2.5 | Agente opera sem possuir XLM | P0 | Conta do agente com saldo zero de XLM conclui pagamento |

### E3 — Pagamento agente → serviço (x402)

| ID | Requisito | Pri | Critério de aceite |
|---|---|---|---|
| RF-3.1 | Agente consome API paga por x402 ponta a ponta | P0 | Loop `402` → pagamento → `200` + recurso, ao vivo, ≤10s |
| RF-3.2 | Pagamento dentro da política é liquidado | P0 | Liquidação confirmada na rede |
| RF-3.3 | Pagamento fora da política é recusado **on-chain** | P0 | Recusa visível com erro tipado, não erro de aplicação |
| RF-3.4 | Serviço vendedor cobra por chamada | P1 | Segunda chamada sem pagamento retorna `402` novamente |

### E4 — Identidade e compliance

| ID | Requisito | Pri | Critério de aceite |
|---|---|---|---|
| RF-4.1 | Emitir claim (KYB) para um endereço | P0 | Consulta de verificação passa a retornar verdadeiro |
| RF-4.2 | Revogar claim | P0 | Operação seguinte da contraparte é recusada |
| RF-4.3 | Claim com validade | P1 | Claim expirado é tratado como ausente |
| RF-4.4 | Pagamento acima de limiar exige contraparte verificada | P0 | Transferência de valor alto para não verificado é recusada |
| RF-4.5 | Separação de papéis (emissor, compliance, fundador) | P1 | Conta sem papel não consegue emitir claim |

### E5 — Tesouraria confidencial

| ID | Requisito | Pri | Critério de aceite |
|---|---|---|---|
| RF-5.1 | Depositar valor público na tesouraria confidencial | P1 | Saldo confidencial aumenta; valor do depósito é público (por desenho) |
| RF-5.2 | Pagar folha com **valores ocultos** | P1 | Explorer mostra remetente e destinatário, não o valor |
| RF-5.3 | Procuração confidencial por agente (teto + prazo) | P1 | Agente gasta como *spender* sem ter a chave de gasto do tesouro |
| RF-5.4 | Gate de identidade nas operações confidenciais | P1 | Após revogação do claim, operação confidencial é recusada |
| RF-5.5 | Sacar de volta para valor público | P2 | Saldo confidencial reduz; saque visível |

### E6 — Ativo permissionado

| ID | Requisito | Pri | Critério de aceite |
|---|---|---|---|
| RF-6.1 | Emitir ativo com restrição de circulação por claim | P1 | Transferência para não verificado é recusada pela rede |
| RF-6.2 | Transferência entre verificados é aceita | P1 | Liquidação confirmada |
| RF-6.3 | Regras adicionais de compliance (teto de saldo, país) | P2 | Regra configurada é aplicada |

### E7 — Auditoria e disclosure

| ID | Requisito | Pri | Critério de aceite |
|---|---|---|---|
| RF-7.1 | Auditor designado decifra valores das transferências confidenciais | P1 | Console do auditor exibe valores que o público não vê |
| RF-7.2 | Divulgação seletiva de **uma** transferência a **um** destinatário | P2 | Destinatário verifica que recebeu exatamente X, sem ver o restante |
| RF-7.3 | Toda decisão de política aprovada gera registro on-chain | P0 | Evento consultável por terceiro |
| RF-7.4 | Tentativas recusadas são reconstruíveis | P1 | Console exibe recusas a partir de transações falhadas |

### E8 — Credencial pública e reputação

| ID | Requisito | Pri | Critério de aceite |
|---|---|---|---|
| RF-8.1 | Consulta única devolve procuração + verificação + conduta | P0 | Uma leitura on-chain, sem indexador |
| RF-8.2 | Endpoint legível por máquina | P1 | Agente contraparte consome JSON e decide |
| RF-8.3 | Página pública da organização | P1 | Terceiro vê agentes, poderes, claims e histórico |
| RF-8.4 | Volume com contrapartes verificadas separado do volume total | P1 | Ambos exibidos; o verificado em destaque |
| RF-8.5 | Ranking de agentes por confiabilidade e volume | P2 | Ordenação reproduzível a partir de dados on-chain |

### E9 — Console e operação

| ID | Requisito | Pri | Critério de aceite |
|---|---|---|---|
| RF-9.1 | Feed ao vivo de decisões | P1 | Nova decisão aparece em ≤5s |
| RF-9.2 | **Simulação prévia**: prever recusa antes de enviar | P1 | UI informa o motivo sem consumir transação |
| RF-9.3 | Reconstrução completa do estado a partir da cadeia | P2 | Ambiente novo reproduz o console sem banco próprio |

---

## 7. Histórias principais

**H1 — Fundador constitui a organização**
*Dado que* tenho dois agentes com carteiras e papéis definidos,
*quando* preencho o formulário e confirmo,
*então* uma transação cria a conta corporativa com as procurações instaladas, e recebo o hash.

**H2 — Agente paga uma API sozinho**
*Dado que* o agente `trader` tem teto de $1.000/dia e zero XLM,
*quando* ele chama um endpoint que responde `402`,
*então* ele paga em USDC, recebe o recurso em ≤10s, e o gasto é debitado do teto.

**H3 — Rede recusa operação fora da política**
*Dado que* o agente `auditor` não tem `transfer` no escopo,
*quando* ele tenta transferir,
*então* a operação é recusada on-chain com erro tipado, e o console mostra o motivo.

**H4 — Compliance revoga e o efeito é imediato**
*Dado que* um fornecedor verificado recebia pagamentos confidenciais,
*quando* o compliance officer revoga o claim dele,
*então* a operação seguinte é recusada, sem migrar fundos nem trocar contrato.

**H5 — Folha privada, auditoria completa**
*Dado que* a tesouraria pagou três prestadores,
*quando* um observador abre o explorer,
*então* vê quem pagou quem, mas não quanto; e o auditor designado vê os valores.

**H6 — Contraparte decide contratar**
*Dado que* recebi proposta de `trader*alphafund`, que nunca vi,
*quando* consulto a credencial dele,
*então* obtenho poderes, limites, validade, status de verificação e conduta em uma resposta.

---

## 8. Requisitos não-funcionais

| Categoria | Requisito |
|---|---|
| Latência | Liquidação de pagamento de agente ≤10s ponta a ponta; feed do console ≤5s |
| Custo | Taxa de rede por operação de agente < $0,001, para que micropagamento faça sentido |
| Segurança | Agente nunca possui a chave de gasto do tesouro, em nenhuma das camadas |
| Privacidade | Valores e saldos ocultos na camada confidencial; endereços permanecem públicos (confidencialidade, não anonimato) |
| Auditabilidade | Toda aprovação gera evento on-chain; recusas reconstruíveis da cadeia |
| Verificabilidade por terceiro | Credencial consultável sem indexador próprio e sem confiar no operador |
| Resiliência | Ambiente reconstruível do zero por um comando |
| Limites conhecidos | Suíte confidencial é developer preview não auditada → testnet e valores fictícios |

---

## 9. Métricas de sucesso

**North star (produto):** número de operações de agente autorizadas **dentro de política** por
organização ativa por semana — mede uso real, não cadastro.

| Camada | Métrica | Alvo v0 |
|---|---|---|
| Ativação | Tempo entre abrir o app e ter organização constituída | < 3 min |
| Agentic | Pagamentos x402 liquidados ao vivo | ≥ 1 na demo, ≥ 20 no ensaio |
| Segurança | Operações fora de política recusadas pela rede | 100% das tentativas |
| Enterprise | Pagamentos confidenciais com valor não observável no explorer | 100% |
| Compliance | Latência entre revogar claim e primeira recusa efetiva | Próxima operação |
| Contraparte | Consultas à credencial resolvidas em uma leitura | 100% |

**Métricas de sucesso do hackathon:** duas submissões válidas, demo executada sem terminal,
vídeo gravado, e a frase *"é o mesmo registro nas três camadas"* demonstrada — não afirmada.

---

## 10. Escopo por versão

| Versão | Conteúdo | Estado |
|---|---|---|
| **v0 — hackathon (testnet)** | E1–E4 completos, E5 (P1), E6 (P1), E7 (P1), E8, E9 (P1) | Escopo atual |
| **v1 — piloto** | KYB com provedor real; recuperação de estado do cliente confidencial; MPP channel mode; SEP-2 Federation; multi-organização | Depois do evento |
| **v2 — produção** | Mainnet condicionada a auditoria da suíte confidencial; portabilidade de reputação entre organizações; marketplace de descoberta | Condicional |

---

## 11. Fora de escopo (v0) e por quê

| Item | Motivo |
|---|---|
| Modelos de IA reais nos agentes | O produto é o trilho, não o cérebro; workers determinísticos bastam para provar |
| KYB com provedor real | Integração comercial, não técnica; o registry é o trilho |
| Sealed-bid auction | Outro produto; o mecanismo (`set_spender`) já é demonstrado na tesouraria |
| Marketplace / descoberta de agentes | Sem verificação confiável, marketplace é catálogo de estranhos; verificação vem primeiro |
| Portabilidade de reputação entre orgs | Histórico vive na organização — como reputação de pessoa jurídica |
| Mainnet | Suíte confidencial não auditada |

---

## 12. Modelo de negócio (hipótese)

| Fonte | Racional |
|---|---|
| **Taxa por constituição** | Cobrança única no ato de criar a organização — alinhada ao valor percebido (abrir empresa) |
| **Assinatura por organização ativa** | Console, indexação, endpoint de credencial e página pública como serviço |
| **Taxa sobre volume verificado** | Percentual sobre volume liquidado com contrapartes verificadas — cresce com o uso, não com o cadastro |
| **Licenciamento do módulo de compliance** | Emissores de ativo regulado que querem só a camada de claims |

Nada disso é cobrado no v0. Está aqui porque a pergunta *"quem paga por isso?"* aparece em
banca de trilha enterprise, e a resposta precisa existir antes de ser perguntada.

---

## 13. Riscos de produto

| Risco | Impacto | Mitigação |
|---|---|---|
| Confidencial é developer preview não auditado | Impede produção | Testnet, valores fictícios, declarado no README e no pitch; v2 condicionada a auditoria |
| Perda de estado do cliente confidencial torna fundos inacessíveis | Alto para o usuário | Caminho de recuperação testado; alerta explícito na UI antes do primeiro depósito |
| KYB mock enfraquece a narrativa | Médio (percepção) | Enquadrar o registry como trilho e nomear o provedor real do v1 |
| Reputação farmável | Médio | Destacar volume com contrapartes verificadas, não contagem de operações |
| Regulatório: privacidade vs. obrigação de reporte | Alto no v2 | Auditor designado no registro e divulgação seletiva — privacidade com porta de auditoria por desenho |
| Concorrência do ecossistema ocupar a camada organizacional | Médio | A composição das três camadas é a barreira; nenhuma agent wallet hoje tem identidade organizacional |

---

## 14. Decisões pendentes

1. ~~**Lastro da tesouraria confidencial**~~ — **decidido na fase 0: XLM.** O token confidencial deployado embrulha o SAC nativo, e é o caminho validado ponta a ponta na testnet. USDC fica na camada x402 pública. Trocar o lastro custaria tempo sem ganhar ponto em nenhuma trilha.
2. **Limiar de KYB** — valor fixo por organização no v0; regra por contraparte fica para v1.
3. **Quem é o auditor no v0** — conta controlada pelo próprio time, declarada como mock.
