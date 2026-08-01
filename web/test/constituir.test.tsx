/**
 * Tela de constituição — Fluxo A do SPEC, a abertura da demo.
 *
 * O que precisa ser verdade aqui não é "o formulário funciona": é que o
 * operador consegue constituir a organização **sem tocar no terminal**, e que
 * um erro da rede vira mensagem legível em vez de tela branca.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConstituirForm from "@/components/constituir-form";

/** Preenche o mínimo para uma constituição válida. */
async function preencher(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/organization name/i), "alphafund");
  await user.type(screen.getByLabelText(/label/i), "trader");
}

describe("constituição da organização", () => {
  it("exige nome da organização antes de enviar", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ConstituirForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /charter/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/name/i);
  });

  it("exige ao menos um agente", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ConstituirForm onSubmit={onSubmit} agentesIniciais={[]} />);

    await user.type(screen.getByLabelText(/organization name/i), "alphafund");
    await user.click(screen.getByRole("button", { name: /charter/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/agent/i);
  });

  it("envia nome, agentes e escopos ao constituir", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ hash: "abc123", account: "CA…ORG" });
    render(<ConstituirForm onSubmit={onSubmit} />);

    await preencher(user);
    await user.click(screen.getByRole("button", { name: /charter/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.org).toBe("alphafund");
    expect(arg.agentes[0].label).toBe("trader");
    expect(arg.agentes[0].allowedFns).toContain("transfer");
  });

  it("um agente sem escopo é permitido — é o auditor da demo", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ hash: "abc", account: "CA…ORG" });
    render(
      <ConstituirForm
        onSubmit={onSubmit}
        agentesIniciais={[{ label: "auditor", allowedFns: [], kybThreshold: "0" }]}
      />,
    );

    await user.type(screen.getByLabelText(/organization name/i), "alphafund");
    await user.click(screen.getByRole("button", { name: /charter/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].agentes[0].allowedFns).toEqual([]);
  });

  it("mostra o hash e o link do explorer quando a organização é criada", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({
      hash: "f6d3a3bfe9afe19bc8e3afe4511404bc",
      account: "CC26I3KF3WWHIGQWIQH65HSOROOUW6XXG2FGTZFKAEWKYPGGHLI6OQR6",
    });
    render(<ConstituirForm onSubmit={onSubmit} />);

    await preencher(user);
    await user.click(screen.getByRole("button", { name: /charter/i }));

    // O jurado precisa poder conferir na hora: hash visível e link clicável.
    expect(await screen.findByText(/CC26I3KF/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /explorer/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("f6d3a3bf"));
  });

  it("erro da rede vira mensagem legível, não tela branca", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("HostError: Error(Contract, #5000)"));
    render(<ConstituirForm onSubmit={onSubmit} />);

    await preencher(user);
    await user.click(screen.getByRole("button", { name: /charter/i }));

    const alerta = await screen.findByRole("alert");
    // 5000 = NameTaken. Quem opera precisa saber que o nome já existe, não ver
    // um código de contrato cru.
    expect(alerta).toHaveTextContent(/already exists/i);
  });

  it("desabilita o botão enquanto a transação está em voo", async () => {
    const user = userEvent.setup();
    let resolver: (v: unknown) => void = () => {};
    const onSubmit = vi.fn(() => new Promise((r) => (resolver = r)));
    render(<ConstituirForm onSubmit={onSubmit} />);

    await preencher(user);
    const botao = screen.getByRole("button", { name: /charter/i });
    await user.click(botao);

    // Sem isso, dois cliques nervosos viram duas organizações.
    await waitFor(() => expect(botao).toBeDisabled());
    resolver({ hash: "x", account: "CA…ORG" });
  });
});
