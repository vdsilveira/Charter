/**
 * Entrada na aplicação a partir do site.
 *
 * Os CTAs do site levam a telas onde se assina — constituir uma organização,
 * operar o console. Mandar o visitante para lá sem carteira produz o pior
 * roteiro possível: ele preenche um formulário inteiro e só descobre no fim que
 * não tem como assinar.
 *
 * A credencial pública segue fora disso: quem consulta um agente ainda não é
 * cliente, e exigir carteira ali devolveria o problema que o produto resolve.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import EntrarNoApp from "@/components/landing/entrar-no-app";

const ENDERECO = "GBBH2YATAUUFYAYUGAHLKOA4LFFHASVU7SUADEE5PFON7T33URAUBZHJ";

function api(over: Record<string, unknown> = {}) {
  return {
    isConnected: async () => ({ isConnected: true }),
    requestAccess: async () => ({ address: ENDERECO }),
    getNetwork: async () => ({ network: "TESTNET" }),
    ...over,
  };
}

describe("entrar na aplicação", () => {
  it("conecta a carteira antes de navegar", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    render(<EntrarNoApp destino="/constituir" api={api()} navegar={navegar}>Charter an org</EntrarNoApp>);

    await user.click(screen.getByRole("button", { name: /charter an org/i }));

    await waitFor(() => expect(navegar).toHaveBeenCalledWith("/constituir"));
  });

  it("não navega quando o acesso é recusado na carteira", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    render(
      <EntrarNoApp
        destino="/console"
        api={api({ requestAccess: async () => ({ error: "User declined access" }) })}
        navegar={navegar}
      >
        Console
      </EntrarNoApp>,
    );

    await user.click(screen.getByRole("button", { name: /console/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/declin|recus/i);
    expect(navegar).not.toHaveBeenCalled();
  });

  it("barra quando a carteira está na rede errada", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    render(
      <EntrarNoApp
        destino="/constituir"
        api={api({ getNetwork: async () => ({ network: "PUBLIC" }) })}
        navegar={navegar}
      >
        Charter an org
      </EntrarNoApp>,
    );

    await user.click(screen.getByRole("button", { name: /charter an org/i }));

    // Deixar passar levaria o visitante a assinar na mainnet uma operação de
    // testnet — erro que só aparece depois, com dinheiro real do outro lado.
    expect(await screen.findByRole("alert")).toHaveTextContent(/testnet/i);
    expect(navegar).not.toHaveBeenCalled();
  });

  it("sem Freighter instalado, aponta para a instalação em vez de falhar", async () => {
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

    await user.click(screen.getByRole("button", { name: /charter an org/i }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(/freighter/i);
    expect(aviso.querySelector("a")).toHaveAttribute("href", "https://freighter.app/");
    expect(navegar).not.toHaveBeenCalled();
  });

  it("já conectado, vai direto na segunda vez", async () => {
    const user = userEvent.setup();
    const navegar = vi.fn();
    const requestAccess = vi.fn(async () => ({ address: ENDERECO }));
    render(
      <EntrarNoApp destino="/console" api={api({ requestAccess })} navegar={navegar}>
        Console
      </EntrarNoApp>,
    );

    const botao = screen.getByRole("button", { name: /console/i });
    await user.click(botao);
    await waitFor(() => expect(navegar).toHaveBeenCalledTimes(1));

    await user.click(botao);
    await waitFor(() => expect(navegar).toHaveBeenCalledTimes(2));
    // Pedir acesso de novo a cada clique faria a carteira abrir um pop-up à toa.
    expect(requestAccess).toHaveBeenCalledTimes(1);
  });

  it("avisa enquanto espera a carteira", async () => {
    const user = userEvent.setup();
    let liberar: (v: unknown) => void = () => {};
    render(
      <EntrarNoApp
        destino="/console"
        api={api({ requestAccess: () => new Promise((r) => (liberar = r)) })}
        navegar={vi.fn()}
      >
        Console
      </EntrarNoApp>,
    );

    const botao = screen.getByRole("button", { name: /console/i });
    await user.click(botao);

    await waitFor(() => expect(botao).toBeDisabled());
    liberar({ address: ENDERECO });
  });
});
