/**
 * Escolha da organização nas abas que dependem de uma.
 *
 * Console e credencial apontavam para `alphafund`, fixa em variável de
 * ambiente. Quem constituía a própria organização via o painel de outra pessoa
 * e concluía, com razão, que a sua não tinha sido criada.
 *
 * Com uma só organização não há escolha a fazer — mostrar um seletor de um
 * item é pedir um clique para confirmar o óbvio.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ComOrg from "@/components/seletor-org";

const CARTEIRA = "GAFASLN5AWEKSDNXLRUH525N2FSNTBFLFG53EPUEOKRQCWUI2BLT5JES";

const conectada = () => ({
  isConnected: async () => ({ isConnected: true }),
  getAddress: async () => ({ address: CARTEIRA }),
});

const mostrar = (org: string) => <p>painel de {org}</p>;

describe("escolha da organização", () => {
  it("com uma só, entra direto nela", async () => {
    render(
      <ComOrg api={conectada()} carregar={async () => ["matrix"]}>
        {mostrar}
      </ComOrg>,
    );

    expect(await screen.findByText("painel de matrix")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("com várias, oferece a escolha e começa pela mais recente", async () => {
    const user = userEvent.setup();
    render(
      <ComOrg api={conectada()} carregar={async () => ["matrix", "acme"]}>
        {mostrar}
      </ComOrg>,
    );

    expect(await screen.findByText("painel de matrix")).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox"), "acme");
    expect(await screen.findByText("painel de acme")).toBeInTheDocument();
  });

  it("sem carteira conectada, pede a conexão em vez de mostrar dados alheios", async () => {
    render(
      <ComOrg
        api={{ isConnected: async () => ({ isConnected: true }), getAddress: async () => ({ address: "" }) }}
        carregar={async () => ["matrix"]}
      >
        {mostrar}
      </ComOrg>,
    );

    expect(await screen.findByText(/connect/i)).toBeInTheDocument();
    expect(screen.queryByText(/painel de/)).not.toBeInTheDocument();
  });

  it("carteira sem organizações convida a constituir", async () => {
    render(
      <ComOrg api={conectada()} carregar={async () => []}>
        {mostrar}
      </ComOrg>,
    );

    expect(await screen.findByRole("link", { name: /charter/i })).toHaveAttribute(
      "href",
      "/constituir",
    );
  });

  it("falha de leitura aparece como erro, não como ausência de organização", async () => {
    render(
      <ComOrg
        api={conectada()}
        carregar={async () => {
          throw new Error("Horizon replied 503");
        }}
      >
        {mostrar}
      </ComOrg>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/503/);
  });

  it("busca usando a carteira conectada", async () => {
    const carregar = vi.fn().mockResolvedValue(["matrix"]);
    render(
      <ComOrg api={conectada()} carregar={carregar}>
        {mostrar}
      </ComOrg>,
    );

    await waitFor(() => expect(carregar).toHaveBeenCalledWith(CARTEIRA));
  });
});
