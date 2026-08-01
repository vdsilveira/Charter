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

const CARTEIRA_AGENTE = "GB5563ACWXK2TVE3OC56S7HNFDI7R5UCTNRNXDC2XQQN66LPAH2MIPDB";

describe("taxa de constituição", () => {
  it("mostra quanto custa antes de o usuário assinar", async () => {
    render(<ConstituirForm onSubmit={vi.fn()} taxa="50000000" />);

    // Preço à vista: ninguém deve descobrir a cobrança depois de assinar.
    expect(await screen.findByText(/5 XLM/i)).toBeInTheDocument();
  });

  it("explica que a taxa sai na mesma transação", async () => {
    render(<ConstituirForm onSubmit={vi.fn()} taxa="50000000" />);
    expect(await screen.findByText(/mesma transação/i)).toBeInTheDocument();
  });

  it("constituição gratuita não fala em taxa", () => {
    render(<ConstituirForm onSubmit={vi.fn()} taxa="0" />);
    expect(screen.queryByText(/XLM/i)).not.toBeInTheDocument();
  });

  it("recusa da carteira vira aviso, não tela branca", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("User declined access"));
    render(<ConstituirForm onSubmit={onSubmit} taxa="50000000" />);

    await user.type(screen.getByLabelText(/nome da organização/i), "acme");
    await user.type(screen.getByLabelText(/rótulo/i), "trader");
    await user.click(screen.getByRole("button", { name: /constituir/i }));

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
    expect(screen.getByText(/não move valor|nenhuma função/i)).toBeInTheDocument();
  });

  it("adiciona agente indicando a carteira dele", async () => {
    const user = userEvent.setup();
    const adicionar = vi.fn().mockResolvedValue({ hash: "abc" });
    render(
      <PainelAgentes org="alphafund" carregar={async () => agentes} adicionar={adicionar} />,
    );

    await user.click(await screen.findByRole("button", { name: /adicionar agente/i }));
    await user.type(screen.getByLabelText(/rótulo/i), "tesoureiro");
    await user.type(screen.getByLabelText(/carteira/i), CARTEIRA_AGENTE);
    await user.click(screen.getByRole("button", { name: /^adicionar$/i }));

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

    await user.click(await screen.findByRole("button", { name: /adicionar agente/i }));
    await user.type(screen.getByLabelText(/rótulo/i), "tesoureiro");
    await user.click(screen.getByRole("button", { name: /^adicionar$/i }));

    expect(adicionar).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/carteira/i);
  });

  it("recusa carteira em formato inválido", async () => {
    const user = userEvent.setup();
    const adicionar = vi.fn();
    render(
      <PainelAgentes org="alphafund" carregar={async () => agentes} adicionar={adicionar} />,
    );

    await user.click(await screen.findByRole("button", { name: /adicionar agente/i }));
    await user.type(screen.getByLabelText(/rótulo/i), "tesoureiro");
    await user.type(screen.getByLabelText(/carteira/i), "não é um endereço");
    await user.click(screen.getByRole("button", { name: /^adicionar$/i }));

    // Melhor barrar aqui do que gastar transação para a rede recusar.
    expect(adicionar).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/endereço|inválid/i);
  });

  it("remover pede confirmação — a procuração some da conta", async () => {
    const user = userEvent.setup();
    const remover = vi.fn().mockResolvedValue({ hash: "abc" });
    render(
      <PainelAgentes org="alphafund" carregar={async () => agentes} remover={remover} />,
    );

    await user.click((await screen.findAllByRole("button", { name: /remover/i }))[0]);
    expect(await screen.findByText(/tem certeza/i)).toBeInTheDocument();
    expect(remover).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(remover).toHaveBeenCalledWith("trader"));
  });

  it("agente já revogado aparece marcado e não oferece remoção", async () => {
    render(
      <PainelAgentes
        org="alphafund"
        carregar={async () => [{ ...agentes[0], active: false }]}
      />,
    );

    expect(await screen.findByText(/revogado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remover/i })).not.toBeInTheDocument();
  });
});
