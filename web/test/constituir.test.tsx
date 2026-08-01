/**
 * Tela de constituição — Fluxo A do SPEC, a abertura da demo.
 *
 * O que precisa ser verdade aqui não é "o formulário funciona": é que **quem
 * assina é a carteira conectada**. Antes, o servidor assinava com a chave da
 * demo e a organização nascia fundada por ela — a pessoa pagava com um clique
 * e ficava de fora do próprio contrato social.
 *
 * Cada agente também entra com a carteira dele. Sem isso a procuração não tem
 * para quem ser escrita: antes o servidor gerava um par de chaves e descartava
 * o segredo, e o agente nascia sem forma alguma de assinar.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConstituirForm from "@/components/constituir-form";

const FUNDADOR = "GBBH2YATAUUFYAYUGAHLKOA4LFFHASVU7SUADEE5PFON7T33URAUBZHJ";
const CARTEIRA_AGENTE = "GDRKHJX4HFW4WGEBPLPNRR65E6VZ54SLUN5WPHKEKRSEF2OZMHQZVRIG";

/** Freighter com este site já autorizado. */
const conectada = () => ({
  isConnected: async () => ({ isConnected: true }),
  getAddress: async () => ({ address: FUNDADOR }),
  getNetwork: async () => ({ network: "TESTNET" }),
});

/** Preenche o mínimo para uma constituição válida. */
async function preencher(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/organization name/i), "alphafund");
  await user.type(screen.getByLabelText(/label/i), "trader");
  await user.type(screen.getByLabelText(/agent wallet/i), CARTEIRA_AGENTE);
}

describe("constituição da organização", () => {
  it("exige nome da organização antes de enviar", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ConstituirForm onSubmit={onSubmit} api={conectada()} />);

    await user.click(screen.getByRole("button", { name: /charter/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/name/i);
  });

  it("exige ao menos um agente", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ConstituirForm onSubmit={onSubmit} agentesIniciais={[]} api={conectada()} />);

    await user.type(screen.getByLabelText(/organization name/i), "alphafund");
    await user.click(screen.getByRole("button", { name: /charter/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/agent/i);
  });

  it("envia nome, agentes e escopos ao constituir", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ hash: "abc123", account: "CA…ORG" });
    render(<ConstituirForm onSubmit={onSubmit} api={conectada()} />);

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
        api={conectada()}
        agentesIniciais={[
          { label: "auditor", carteira: CARTEIRA_AGENTE, allowedFns: [], kybThreshold: "0" },
        ]}
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
    render(<ConstituirForm onSubmit={onSubmit} api={conectada()} />);

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
    render(<ConstituirForm onSubmit={onSubmit} api={conectada()} />);

    await preencher(user);
    await user.click(screen.getByRole("button", { name: /charter/i }));

    const alerta = await screen.findByRole("alert");
    // 5000 = NameTaken. Quem opera precisa saber que o nome já existe, não ver
    // um código de contrato cru.
    expect(alerta).toHaveTextContent(/already exists/i);
  });

  it("manda o endereço conectado como fundador", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ hash: "abc", account: "CA…ORG" });
    render(<ConstituirForm onSubmit={onSubmit} api={conectada()} />);

    await preencher(user);
    await user.click(screen.getByRole("button", { name: /charter/i }));

    // Quem paga a taxa e quem fica como fundador tem de ser a mesma carteira.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].fundador).toBe(FUNDADOR);
    expect(onSubmit.mock.calls[0][0].agentes[0].carteira).toBe(CARTEIRA_AGENTE);
  });

  it("mostra qual carteira vai assinar", async () => {
    render(<ConstituirForm onSubmit={vi.fn()} api={conectada()} />);
    expect(await screen.findByText(/GBBH2YAT/)).toBeInTheDocument();
  });

  it("sem carteira conectada, explica em vez de enviar", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ConstituirForm
        onSubmit={onSubmit}
        api={{ isConnected: async () => ({ isConnected: true }), getAddress: async () => ({ address: "" }) }}
      />,
    );

    await preencher(user);
    await user.click(screen.getByRole("button", { name: /charter/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/wallet/i);
  });

  it("exige a carteira de cada agente", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ConstituirForm onSubmit={onSubmit} api={conectada()} />);

    await user.type(screen.getByLabelText(/organization name/i), "alphafund");
    await user.type(screen.getByLabelText(/label/i), "trader");
    await user.click(screen.getByRole("button", { name: /charter/i }));

    // A procuração é escrita para o endereço do agente: sem ele não há o que
    // registrar, e antes isto virava uma chave gerada e perdida no servidor.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/wallet/i);
  });

  it("desabilita o botão enquanto a transação está em voo", async () => {
    const user = userEvent.setup();
    let resolver: (v: { hash: string; account: string }) => void = () => {};
    const onSubmit = vi.fn(
      () => new Promise<{ hash: string; account: string }>((r) => (resolver = r)),
    );
    render(<ConstituirForm onSubmit={onSubmit} api={conectada()} />);

    await preencher(user);
    const botao = screen.getByRole("button", { name: /charter/i });
    await user.click(botao);

    // Sem isso, dois cliques nervosos viram duas organizações.
    await waitFor(() => expect(botao).toBeDisabled());
    resolver({ hash: "x", account: "CA…ORG" });
  });
});
