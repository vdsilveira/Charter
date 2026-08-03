/**
 * Aporte ao tesouro da organização.
 *
 * O que precisa ser verdade: o operador entende **o que** está financiando. A
 * confusão natural é achar que o saldo paga a taxa das transações do agente —
 * não paga; isso é o patrocinador. O saldo é o valor que o agente move, e uma
 * organização sem ele tem procuração correta e transferência que falha assim
 * mesmo, com erro do token que não menciona saldo.
 *
 * O valor é digitado em XLM e vai em stroops. Errar a conversão por um fator de
 * dez milhões é o tipo de bug que só aparece depois de enviado.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Tesouro from "@/components/tesouro";

const CARTEIRA = "GCCTAKNG7GHF4SYPXGY25DCK7RLLPKMUVODCDUYZNYYVD2XWDIZXGGLQ";

const conectada = () => ({
  isConnected: async () => ({ isConnected: true }),
  getAddress: async () => ({ address: CARTEIRA }),
});

const props = (over: Record<string, unknown> = {}) => ({
  org: "Matrix",
  api: conectada(),
  lerSaldo: vi.fn().mockResolvedValue("3000000000"), // 300 XLM
  aportar: vi.fn().mockResolvedValue({ hash: "abc123" }),
  ...over,
});

describe("tesouro da organização", () => {
  it("mostra o saldo em XLM, não em stroops", async () => {
    render(<Tesouro {...props()} />);
    // 3000000000 stroops são 300 XLM. Mostrar o número cru seria assustador e
    // inútil.
    expect(await screen.findByText(/300 XLM/)).toBeInTheDocument();
  });

  it("aporta convertendo XLM para stroops", async () => {
    const user = userEvent.setup();
    const aportar = vi.fn().mockResolvedValue({ hash: "abc" });
    render(<Tesouro {...props({ aportar })} />);

    await screen.findByText(/300 XLM/);
    await user.type(screen.getByLabelText(/amount/i), "8.1");
    await user.click(screen.getByRole("button", { name: /add funds/i }));

    // 8.1 XLM = 81000000 stroops, exatos — não 81000000.00000001.
    await waitFor(() => expect(aportar).toHaveBeenCalledWith("81000000", CARTEIRA));
  });

  it("valor inválido vira aviso e nada é enviado", async () => {
    const user = userEvent.setup();
    const aportar = vi.fn();
    render(<Tesouro {...props({ aportar })} />);

    await screen.findByText(/300 XLM/);
    await user.type(screen.getByLabelText(/amount/i), "0.00000001");
    await user.click(screen.getByRole("button", { name: /add funds/i }));

    expect(aportar).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/decimal/i);
  });

  it("sem carteira conectada, explica em vez de enviar", async () => {
    const user = userEvent.setup();
    const aportar = vi.fn();
    render(
      <Tesouro
        {...props({
          aportar,
          api: {
            isConnected: async () => ({ isConnected: true }),
            getAddress: async () => ({ address: "" }),
          },
        })}
      />,
    );

    await user.type(screen.getByLabelText(/amount/i), "10");
    await user.click(screen.getByRole("button", { name: /add funds/i }));

    expect(aportar).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/wallet/i);
  });

  it("relê o saldo depois do aporte", async () => {
    const user = userEvent.setup();
    const lerSaldo = vi
      .fn()
      .mockResolvedValueOnce("3000000000")
      .mockResolvedValueOnce("3100000000");
    render(<Tesouro {...props({ lerSaldo })} />);

    await screen.findByText(/300 XLM/);
    await user.type(screen.getByLabelText(/amount/i), "10");
    await user.click(screen.getByRole("button", { name: /add funds/i }));

    // Sem reler, o operador aporta de novo achando que não funcionou.
    expect(await screen.findByText(/310 XLM/)).toBeInTheDocument();
  });

  it("saldo zero é dito com todas as letras", async () => {
    render(<Tesouro {...props({ lerSaldo: vi.fn().mockResolvedValue("0") })} />);

    // É a causa mais provável de "o agente não consegue transferir".
    expect(await screen.findByText(/cannot move value|no funds/i)).toBeInTheDocument();
  });

  it("distingue saldo de taxa", async () => {
    render(<Tesouro {...props()} />);
    // A confusão que motivou a tela.
    expect(await screen.findByText(/fee/i)).toBeInTheDocument();
  });

  it("recusa da carteira aparece na tela", async () => {
    const user = userEvent.setup();
    render(
      <Tesouro {...props({ aportar: vi.fn().mockRejectedValue(new Error("User declined")) })} />,
    );

    await screen.findByText(/300 XLM/);
    await user.type(screen.getByLabelText(/amount/i), "10");
    await user.click(screen.getByRole("button", { name: /add funds/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/declined/i);
  });
});
