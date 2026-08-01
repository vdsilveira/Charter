/**
 * Entrada na aplicação a partir do site.
 *
 * Os CTAs levam a telas onde se assina. A caixa aparece **sempre** — inclusive
 * para quem já autorizou a carteira. A versão anterior passava direto nesse
 * caso, e o efeito prático era indistinguível de não haver verificação
 * nenhuma: o clique navegava num piscar. Um passo explícito custa um clique e
 * elimina a dúvida sobre qual conta vai assinar.
 *
 * A credencial pública fica fora disso: quem consulta um agente ainda não é
 * cliente, e exigir carteira ali devolveria o problema que o produto resolve.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import EntrarNoApp from "@/components/landing/entrar-no-app";

const ENDERECO = "GBBH2YATAUUFYAYUGAHLKOA4LFFHASVU7SUADEE5PFON7T33URAUBZHJ";

/** Freighter instalado, porém ainda sem autorizar este site. */
function apiNaoAutorizada(over: Record<string, unknown> = {}) {
  return {
    isConnected: async () => ({ isConnected: true }),
    // Endereço vazio é como o Freighter diz "instalado, mas sem permissão".
    getAddress: async () => ({ address: "" }),
    requestAccess: async () => ({ address: ENDERECO }),
    getNetwork: async () => ({ network: "TESTNET" }),
    ...over,
  };
}

/** Freighter já autorizado para este site. */
function apiAutorizada(over: Record<string, unknown> = {}) {
  return apiNaoAutorizada({ getAddress: async () => ({ address: ENDERECO }), ...over });
}

const clicarCta = (user: ReturnType<typeof userEvent.setup>, nome: RegExp) =>
  user.click(screen.getByRole("button", { name: nome }));

describe("entrada na aplicação", () => {
  it("mesmo já autorizado, confirma antes de entrar", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    render(
      <EntrarNoApp destino="/console" api={apiAutorizada()} navegar={navegar}>
        Console
      </EntrarNoApp>,
    );

    await clicarCta(user, /console/i);

    // Navegar num piscar é indistinguível de não verificar nada.
    const caixa = await screen.findByRole("dialog");
    expect(caixa).toHaveTextContent(/GBBH2YAT/);
    expect(navegar).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(navegar).toHaveBeenCalledWith("/console"));
  });

  it("mostra qual conta vai assinar", async () => {
    const user = userEvent.setup();
    render(
      <EntrarNoApp destino="/constituir" api={apiAutorizada()} navegar={vi.fn()}>
        Charter an org
      </EntrarNoApp>,
    );

    await clicarCta(user, /charter an org/i);
    // Quem tem várias contas na carteira precisa saber qual está ativa antes
    // de constituir uma organização em nome dela.
    expect(await screen.findByRole("dialog")).toHaveTextContent(/GBBH2YAT/);
  });

  it("sem autorização, abre a caixa de conexão em vez de navegar", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    render(
      <EntrarNoApp destino="/constituir" api={apiNaoAutorizada()} navegar={navegar}>
        Charter an org
      </EntrarNoApp>,
    );

    await clicarCta(user, /charter an org/i);

    const caixa = await screen.findByRole("dialog");
    expect(caixa).toHaveTextContent(/connect/i);
    expect(navegar).not.toHaveBeenCalled();
  });

  it("conecta pela caixa e então navega", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    render(
      <EntrarNoApp destino="/constituir" api={apiNaoAutorizada()} navegar={navegar}>
        Charter an org
      </EntrarNoApp>,
    );

    await clicarCta(user, /charter an org/i);
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /connect freighter/i }));

    await waitFor(() => expect(navegar).toHaveBeenCalledWith("/constituir"));
  });

  it("recusa na carteira mantém a caixa aberta com o motivo", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    render(
      <EntrarNoApp
        destino="/constituir"
        api={apiNaoAutorizada({ requestAccess: async () => ({ error: "User declined access" }) })}
        navegar={navegar}
      >
        Charter an org
      </EntrarNoApp>,
    );

    await clicarCta(user, /charter an org/i);
    await user.click(await screen.findByRole("button", { name: /connect freighter/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/declin/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(navegar).not.toHaveBeenCalled();
  });

  it("rede errada barra antes de navegar", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    render(
      <EntrarNoApp
        destino="/constituir"
        api={apiNaoAutorizada({ getNetwork: async () => ({ network: "PUBLIC" }) })}
        navegar={navegar}
      >
        Charter an org
      </EntrarNoApp>,
    );

    await clicarCta(user, /charter an org/i);
    await user.click(await screen.findByRole("button", { name: /connect freighter/i }));

    // Deixar passar levaria alguém a assinar na mainnet uma operação de testnet.
    expect(await screen.findByRole("alert")).toHaveTextContent(/testnet/i);
    expect(navegar).not.toHaveBeenCalled();
  });

  it("sem Freighter, a caixa aponta para a instalação", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    render(
      <EntrarNoApp
        destino="/constituir"
        api={{ isConnected: async () => ({ isConnected: false }) }}
        navegar={navegar}
      >
        Charter an org
      </EntrarNoApp>,
    );

    await clicarCta(user, /charter an org/i);

    const caixa = await screen.findByRole("dialog");
    expect(caixa.querySelector('a[href="https://freighter.app/"]')).toBeTruthy();
    expect(navegar).not.toHaveBeenCalled();
  });

  it("dá para fechar a caixa e ficar no site", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    render(
      <EntrarNoApp destino="/constituir" api={apiNaoAutorizada()} navegar={navegar}>
        Charter an org
      </EntrarNoApp>,
    );

    await clicarCta(user, /charter an org/i);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(navegar).not.toHaveBeenCalled();
  });

  it("a caixa diz para onde se está indo e por que a carteira é necessária", async () => {
    const user = userEvent.setup();
    render(
      <EntrarNoApp destino="/constituir" api={apiNaoAutorizada()} navegar={vi.fn()}>
        Charter an org
      </EntrarNoApp>,
    );

    await clicarCta(user, /charter an org/i);
    const caixa = await screen.findByRole("dialog");

    // Pedir carteira sem dizer para quê é o que faz gente fechar a aba.
    expect(caixa).toHaveTextContent(/sign/i);
    expect(caixa).toHaveTextContent(/testnet/i);
  });
});
