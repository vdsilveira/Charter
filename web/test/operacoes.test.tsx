/**
 * Feed de operações e ranking de agentes, na página de gestão da organização.
 *
 * O que precisa ser verdade: as duas telas dizem a verdade sobre o que a rede
 * registrou. Falha de leitura não pode virar lista vazia — são coisas
 * diferentes, e confundi-las esconde uma RPC caída atrás de uma tela plausível.
 *
 * O formulário de pagamento saiu daqui junto com o console. Ele assinava com a
 * chave do agente **no servidor**, o que contradiz o modelo de cada agente ter a
 * própria — e `src/charter-simulacao.mjs` faz o mesmo caminho do jeito certo,
 * com a chave vivendo só no processo do agente.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Feed from "@/components/feed";
import Leaderboard from "@/components/leaderboard";

const decisoes = [
  { tx: "aa11", ledger: 10, para: "GBG6UX7LDUU5ZAVRASDVB3EP7BXKM7ZXVHZQWPPPQXTVVUOSNRCWCGQO", amount: "100", counterpartyVerified: false },
  { tx: "bb22", ledger: 11, para: "GBG6UX7LDUU5ZAVRASDVB3EP7BXKM7ZXVHZQWPPPQXTVVUOSNRCWCGQO", amount: "900", counterpartyVerified: true },
];

/** Endereços válidos: a tela recusa formato inválido antes de simular. */
const SEM_CLAIM = "GDGTUEWBXFWV6INIRD6CMHGFVTILUYJIGYHJFNUNWYXIRHABEAYDGKDM";
const COM_CLAIM = "GBZFNF6MRYZ4DEDHQTJO3KXLIFQQAB4EMXER2ZZPYDMF5MVT3S4LM4ZN";
const QUALQUER = "GA553CCPL3ABAUQWUD6POLZLWG4QX3RS5BIMZOD6NCHOENNYUOQTPG54";

describe("feed de decisões", () => {
  it("lista as decisões vindas da cadeia", async () => {
    render(<Feed carregar={async () => decisoes} />);

    expect(await screen.findByText(/900/)).toBeInTheDocument();
    // A linha não nomeia mais o agente: o evento próprio do gate saiu para o
    // Charter poder operar com o x402. A atribuição por agente segue no
    // ranking, que lê o AgentStats.
    expect(screen.getAllByText(/GBG6UX/).length).toBeGreaterThan(0);
  });

  it("distingue contraparte verificada de não verificada", async () => {
    render(<Feed carregar={async () => decisoes} />);

    const linhas = await screen.findAllByRole("row");
    // A distinção precisa estar na tela: é o que separa volume que conta de
    // volume que não conta.
    expect(linhas.some((l) => /verified/i.test(l.textContent ?? ""))).toBe(true);
  });

  it("estado vazio explica, em vez de mostrar tabela vazia", async () => {
    render(<Feed carregar={async () => []} />);
    expect(await screen.findByText(/no decisions/i)).toBeInTheDocument();
  });

  it("falha de leitura aparece como erro, não como lista vazia", async () => {
    render(<Feed carregar={async () => { throw new Error("rpc caiu"); }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/rpc caiu|could not read/i);
  });
});

describe("leaderboard", () => {
  const agentes = [
    { label: "auditor", active: true, opsOk: 9, volumeTotal: "5000", volumeAttested: "0" },
    { label: "trader", active: true, opsOk: 3, volumeTotal: "1000", volumeAttested: "900" },
  ];

  it("ordena por volume com contraparte verificada, não por volume total", async () => {
    render(<Leaderboard carregar={async () => agentes} />);

    const linhas = await screen.findAllByRole("row");
    const corpo = linhas.slice(1).map((l) => l.textContent ?? "");
    // O auditor tem mais volume total, mas zero atestado: contagem bruta é
    // farmável, volume com contraparte verificada não.
    expect(corpo[0]).toMatch(/trader/i);
  });

  it("marca agente revogado em vez de escondê-lo", async () => {
    render(
      <Leaderboard
        carregar={async () => [{ ...agentes[1], active: false }]}
      />,
    );
    expect(await screen.findByText(/revoked/i)).toBeInTheDocument();
  });
});
