# Charter — contexto para redesenho

Frontend de um produto de infraestrutura financeira na Stellar: constituição de
organizações que operam por agentes de software, com procuração programável,
compliance verificável e liquidação confidencial.

Fique à vontade para repensar a aparência. O que **não** pode mudar está abaixo
— não por apego, mas porque são as coisas que 49 testes verificam e que a
aplicação de fato faz.

---

## O que a interface precisa continuar afirmando

Estas frases e estados são verificados por teste. Reescrever o texto é possível
desde que o **sentido** permaneça e os padrões abaixo continuem casando.

| Onde | Precisa continuar existindo |
|---|---|
| Credencial do agente | "volume com contraparte verificada" em destaque, separado do volume total |
| Agente sem escopo | texto contendo "não pode invocar" ou "nenhuma função" |
| Agente revogado | a palavra "revogado" — e os poderes continuam visíveis |
| Organização sem claim | texto contendo "não verificad" |
| Taxa | valor em XLM e a expressão "mesma transação" |
| Carteira ausente | a palavra "Freighter" e um link "Instalar" |
| Rede errada | aviso contendo "testnet" |
| Remoção de agente | confirmação com "Tem certeza" antes de agir |
| Pagamento recusado | `role="alert"` com o motivo traduzido |
| Feed vazio | "Nenhuma decisão" — estado vazio explica, não mostra tabela vazia |

Além disso: elementos de erro usam `role="alert"`, tabelas usam `<table>` com
linhas reais (`role="row"`), e os campos têm `<label>` associado — os testes
buscam por rótulo acessível, não por classe.

## Regras de produto que a tela carrega

Não são detalhes visuais; são o argumento do produto.

1. **A credencial pública não pede carteira.** Ela é lida por uma contraparte
   que ainda não é cliente. Um "conecte sua carteira" nessa página devolveria o
   problema que o produto resolve.
2. **A simulação prévia bloqueia o envio.** O botão de enviar só habilita depois
   que a rede confirma que aceitaria. Sem isso o usuário paga uma transação para
   descobrir que foi barrado.
3. **Volume com contraparte verificada ordena o ranking**, não o volume total —
   contagem bruta é farmável, volume atestado não.
4. **Revogado ≠ inexistente.** Agente revogado aparece marcado, nunca some.
5. **A rede fica visível o tempo todo.** Numa aplicação que move valor, descobrir
   tarde que se estava na rede errada é caro.

## Sistema visual atual

Se for substituir, substitua por outro sistema — não por classes soltas.

- **Cor** em tokens CSS (`app/globals.css`): `--ink` #101720 (tinta, viés azul),
  `--paper` #FAF9F7, `--slate` #5B6675, acento `--seal` #A6521C (âmbar de
  lacre). Verde e vermelho são **semânticos** (aprovado / recusado) e não contam
  como acento. Claro e escuro definidos por `prefers-color-scheme` e por
  `data-theme`, que precisa vencer nos dois sentidos.
- **Tipografia**: Newsreader (títulos, ar de documento), IBM Plex Sans
  (interface), IBM Plex Mono (endereços, hashes, valores — com `tabular-nums`).
- Nenhum componente referencia cor fora dos tokens. Classes utilitárias
  disponíveis: `bg-paper`, `bg-surface`, `text-ink`, `text-slate`,
  `border-hairline`, `text-seal`, `bg-sealsoft`, `text-ok`, `bg-oksoft`,
  `text-deny`, `bg-denysoft`, mais `.rotulo` e `.dados`.

## Estrutura

```
app/
  page.tsx              abertura
  constituir/           casca; o formulário vive em components/
  console/              operador: pagamento, feed, ranking
  o/[org]/              credencial pública (server-rendered, sem carteira)
  org/[org]/            administração de agentes
  api/                  leitura e escrita on-chain
  federation/           SEP-2 (resolve trader*dominio)
components/
  ui/                   button, card, badge, input
  chrome.tsx            barra do app
  credencial-agente.tsx feed.tsx leaderboard.tsx
  pagamento-form.tsx    painel-agentes.tsx conectar-carteira.tsx
lib/
  chain.ts              leituras (simulação, sem carteira)
  write.ts              escritas (server-only)
  errors.ts             tradução de código de contrato para linguagem de operador
  federation.ts carteira.ts utils.ts
test/                   49 testes de componente + 10 de integração
```

## Como verificar depois de mexer

```bash
pnpm install
pnpm test     # 49 testes de componente; não precisa de rede
pnpm build
```

Os testes de integração (`test:write`, `test/chain.test.ts`) tocam a testnet e
precisam de `.env.demo`, que não vai neste pacote — ignore-os no redesenho.
