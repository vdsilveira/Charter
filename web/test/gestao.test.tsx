/**
 * Taxa de constituição e gestão de agentes.
 *
 * Duas telas que só existem porque a carteira do administrador governa a
 * organização: ele paga para constituir e indica a carteira de cada agente. As
 * regras são escritas para a carteira do agente — o administrador aponta o
 * endereço, nunca guarda a chave.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConstituirForm from "@/components/constituir-form";
import PainelAgentes from "@/components/painel-agentes";

const FUNDADOR = "GBBH2YATAUUFYAYUGAHLKOA4LFFHASVU7SUADEE5PFON7T33URAUBZHJ";
const CARTEIRA_AGENTE = "GB5563ACWXK2TVE3OC56S7HNFDI7R5UCTNRNXDC2XQQN66LPAH2MIPDB";

describe("taxa de constituição", () => {
  it("mostra quanto custa antes de o usuário assinar", async () => {
    render(<ConstituirForm onSubmit={vi.fn()} taxa="50000000" />);

    // Preço à vista: ninguém deve descobrir a cobrança depois de assinar.
    expect(await screen.findByText(/5 XLM/i)).toBeInTheDocument();
  });

  it("explica que a taxa sai na mesma transação", async () => {
    render(<ConstituirForm onSubmit={vi.fn()} taxa="50000000" />);
    expect(await screen.findByText(/same transaction/i)).toBeInTheDocument();
  });

  it("constituição gratuita não fala em taxa", () => {
    render(<ConstituirForm onSubmit={vi.fn()} taxa="0" />);
    expect(screen.queryByText(/XLM/i)).not.toBeInTheDocument();
  });

  it("recusa da carteira vira aviso, não tela branca", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("User declined access"));
    render(
      <ConstituirForm
        onSubmit={onSubmit}
        taxa="50000000"
        api={{
          isConnected: async () => ({ isConnected: true }),
          getAddress: async () => ({ address: FUNDADOR }),
        }}
      />,
    );

    await user.type(screen.getByLabelText(/organization name/i), "acme");
    await user.type(screen.getByLabelText(/label/i), "trader");
    await user.type(screen.getByLabelText(/agent wallet/i), CARTEIRA_AGENTE);
    // Recusar na carteira é caminho normal, não exceção: quem lê a taxa e
    // desiste precisa ver o motivo, não uma tela em branco.
    await user.click(screen.getByRole("button", { name: /charter/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/declin|recus/i);
  });
});

describe("painel de agentes", () => {
  const agentes = [
    { label: "trader", active: true, allowedFns: ["transfer"], kybThreshold: "500" },
    { label: "auditor", active: true, allowedFns: [], kybThreshold: "0" },
  ];

  it("lista os agentes com o que cada um pode fazer", async () => {
    render(<PainelAgentes org="alphafund" carregar={async () => agentes} />);

    expect(await screen.findByText("trader")).toBeInTheDocument();
    // O auditor não move valor — a lista tem de deixar isso explícito.
    expect(screen.getByText(/moves no value|no function in scope/i)).toBeInTheDocument();
  });

  it("adiciona agente indicando a carteira dele", async () => {
    const user = userEvent.setup();
    const adicionar = vi.fn().mockResolvedValue({ hash: "abc" });
    render(
      <PainelAgentes org="alphafund" carregar={async () => agentes} adicionar={adicionar} />,
    );

    await user.click(await screen.findByRole("button", { name: /add agent/i }));
    await user.type(screen.getByLabelText(/label/i), "tesoureiro");
    await user.type(screen.getByLabelText(/wallet/i), CARTEIRA_AGENTE);
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(adicionar).toHaveBeenCalledTimes(1));
    const arg = adicionar.mock.calls[0][0];
    expect(arg.label).toBe("tesoureiro");
    // A regra é escrita para a carteira do agente, não para a do administrador.
    expect(arg.carteira).toBe(CARTEIRA_AGENTE);
  });

  it("exige a carteira do agente antes de enviar", async () => {
    const user = userEvent.setup();
    const adicionar = vi.fn();
    render(
      <PainelAgentes org="alphafund" carregar={async () => agentes} adicionar={adicionar} />,
    );

    await user.click(await screen.findByRole("button", { name: /add agent/i }));
    await user.type(screen.getByLabelText(/label/i), "tesoureiro");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(adicionar).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/wallet/i);
  });

  it("recusa carteira em formato inválido", async () => {
    const user = userEvent.setup();
    const adicionar = vi.fn();
    render(
      <PainelAgentes org="alphafund" carregar={async () => agentes} adicionar={adicionar} />,
    );

    await user.click(await screen.findByRole("button", { name: /add agent/i }));
    await user.type(screen.getByLabelText(/label/i), "tesoureiro");
    await user.type(screen.getByLabelText(/wallet/i), "não é um endereço");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    // Melhor barrar aqui do que gastar transação para a rede recusar.
    expect(adicionar).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/address|invalid/i);
  });

  it("remover pede confirmação — a procuração some da conta", async () => {
    const user = userEvent.setup();
    const remover = vi.fn().mockResolvedValue({ hash: "abc" });
    render(
      <PainelAgentes org="alphafund" carregar={async () => agentes} remover={remover} />,
    );

    await user.click((await screen.findAllByRole("button", { name: /remove/i }))[0]);
    expect(await screen.findByText(/are you sure/i)).toBeInTheDocument();
    expect(remover).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(remover).toHaveBeenCalledWith("trader"));
  });

  it("agente já revogado aparece marcado e não oferece remoção", async () => {
    render(
      <PainelAgentes
        org="alphafund"
        carregar={async () => [{ ...agentes[0], active: false }]}
      />,
    );

    expect(await screen.findByText(/revoked/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });
});
