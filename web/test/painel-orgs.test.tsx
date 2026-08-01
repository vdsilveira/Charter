/**
 * Painel das organizações da carteira conectada.
 *
 * O que precisa ser verdade: quem constituiu encontra o que constituiu. Antes
 * não havia esse lugar — o console apontava para uma organização fixa em
 * variável de ambiente, e uma organização recém-criada com um agente de nome
 * próprio simplesmente não aparecia em tela nenhuma.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MinhasOrgs from "@/components/minhas-orgs";

const CARTEIRA = "GAFASLN5AWEKSDNXLRUH525N2FSNTBFLFG53EPUEOKRQCWUI2BLT5JES";

const conectada = () => ({
  isConnected: async () => ({ isConnected: true }),
  getAddress: async () => ({ address: CARTEIRA }),
});

const matrix = { org: "matrix", agentes: ["Neo"], hash: "498ace77", criadaEm: "2026-08-01T18:21:25Z" };

describe("minhas organizações", () => {
  it("lista a organização e os agentes dela", async () => {
    render(<MinhasOrgs api={conectada()} carregar={async () => [matrix]} />);

    expect(await screen.findByText("matrix")).toBeInTheDocument();
    expect(screen.getByText("Neo")).toBeInTheDocument();
  });

  it("mostra o nome pelo qual a contraparte encontra o agente", async () => {
    render(<MinhasOrgs api={conectada()} carregar={async () => [matrix]} />);

    // É o subdomínio SEP-2; sem ele, o nome do agente parece decorativo.
    expect(await screen.findByText("Neo*matrix")).toBeInTheDocument();
  });

  it("leva para gerenciar e para a credencial pública", async () => {
    render(<MinhasOrgs api={conectada()} carregar={async () => [matrix]} />);

    await screen.findByText("matrix");
    expect(screen.getByRole("link", { name: /manage/i })).toHaveAttribute("href", "/org/matrix");
    expect(screen.getByRole("link", { name: /credential/i })).toHaveAttribute("href", "/o/matrix");
  });

  it("carteira sem organizações explica em vez de mostrar lista vazia", async () => {
    render(<MinhasOrgs api={conectada()} carregar={async () => []} />);

    expect(await screen.findByText(/haven't chartered|no organizations/i)).toBeInTheDocument();
  });

  it("sem carteira conectada, pede a conexão", async () => {
    render(
      <MinhasOrgs
        api={{ isConnected: async () => ({ isConnected: true }), getAddress: async () => ({ address: "" }) }}
        carregar={async () => [matrix]}
      />,
    );

    expect(await screen.findByText(/connect/i)).toBeInTheDocument();
    expect(screen.queryByText("matrix")).not.toBeInTheDocument();
  });

  it("falha de leitura aparece como erro, não como lista vazia", async () => {
    // Confundir "não tem" com "não consegui ler" faria alguém concluir que
    // perdeu a organização.
    render(
      <MinhasOrgs
        api={conectada()}
        carregar={async () => {
          throw new Error("Horizon replied 503");
        }}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/503/);
  });

  it("organização sem agentes ativos não finge ter", async () => {
    render(
      <MinhasOrgs api={conectada()} carregar={async () => [{ ...matrix, agentes: [] }]} />,
    );

    await screen.findByText("matrix");
    expect(screen.getByText(/no agents in force/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot move value/i)).toBeInTheDocument();
  });

  it("passa a carteira conectada para a busca", async () => {
    const carregar = vi.fn().mockResolvedValue([matrix]);
    render(<MinhasOrgs api={conectada()} carregar={carregar} />);

    await waitFor(() => expect(carregar).toHaveBeenCalledWith(CARTEIRA));
  });
});
