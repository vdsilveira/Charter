/**
 * Console do operador — feed, leaderboard e simulação prévia.
 *
 * A simulação prévia é o teste que mais importa: ela existe porque o caminho de
 * recusa reverte a transação e não deixa rastro gravável. Se a UI só descobrisse
 * a recusa depois de enviar, o operador pagaria uma transação para receber um
 * erro — e na demo isso viraria um silêncio constrangedor.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Feed from "@/components/feed";
import Leaderboard from "@/components/leaderboard";
import PagamentoForm from "@/components/pagamento-form";

const decisoes = [
  { tx: "aa11", ledger: 10, agent: "trader", fn: "transfer", amount: "100", counterpartyVerified: false },
  { tx: "bb22", ledger: 11, agent: "trader", fn: "transfer", amount: "900", counterpartyVerified: true },
];

describe("feed de decisões", () => {
  it("lista as decisões vindas da cadeia", async () => {
    render(<Feed carregar={async () => decisoes} />);

    expect(await screen.findByText(/900/)).toBeInTheDocument();
    expect(screen.getAllByText(/trader/i).length).toBeGreaterThan(0);
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

describe("simulação prévia do pagamento", () => {
  it("avisa que a operação seria recusada ANTES de enviar", async () => {
    const user = userEvent.setup();
    const simular = vi.fn().mockResolvedValue({
      wouldSucceed: false,
      error: "Error(Contract, #4003)",
    });
    const enviar = vi.fn();

    render(<PagamentoForm simular={simular} enviar={enviar} />);
    await user.type(screen.getByLabelText(/recipient/i), "GA…SEMCLAIM");
    await user.type(screen.getByLabelText(/amount/i), "900");
    await user.click(screen.getByRole("button", { name: /simulate/i }));

    // O motivo, traduzido: "4003" não diz nada a quem opera.
    expect(await screen.findByRole("alert")).toHaveTextContent(/counterparty is not verified/i);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("não deixa enviar enquanto a simulação diz que seria recusada", async () => {
    const user = userEvent.setup();
    const simular = vi.fn().mockResolvedValue({ wouldSucceed: false, error: "Error(Contract, #4003)" });
    const enviar = vi.fn();

    render(<PagamentoForm simular={simular} enviar={enviar} />);
    await user.type(screen.getByLabelText(/recipient/i), "GA…SEMCLAIM");
    await user.type(screen.getByLabelText(/amount/i), "900");
    await user.click(screen.getByRole("button", { name: /simulate/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /send/i })).toBeDisabled(),
    );
  });

  it("libera o envio quando a simulação aprova", async () => {
    const user = userEvent.setup();
    const simular = vi.fn().mockResolvedValue({ wouldSucceed: true });
    const enviar = vi.fn().mockResolvedValue({ hash: "ok123" });

    render(<PagamentoForm simular={simular} enviar={enviar} />);
    await user.type(screen.getByLabelText(/recipient/i), "GA…COMCLAIM");
    await user.type(screen.getByLabelText(/amount/i), "100");
    await user.click(screen.getByRole("button", { name: /simulate/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /send/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
  });

  it("traduz o estouro de cota, não só o gate de KYB", async () => {
    const user = userEvent.setup();
    const simular = vi.fn().mockResolvedValue({
      wouldSucceed: false,
      error: "Error(Contract, #3221)",
    });

    render(<PagamentoForm simular={simular} enviar={vi.fn()} />);
    await user.type(screen.getByLabelText(/recipient/i), "GA…QUALQUER");
    await user.type(screen.getByLabelText(/amount/i), "999999");
    await user.click(screen.getByRole("button", { name: /simulate/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/quota|limit/i);
  });
});
