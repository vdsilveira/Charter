/**
 * Gráfico de conduta dos agentes.
 *
 * O que precisa ser verdade: a barra tem de tornar visível a **distinção entre
 * volume que conta e volume que não conta**. Contagem de operações e volume
 * bruto são farmáveis — basta transacionar com a própria segunda conta. Volume
 * com contraparte verificada exige convencer entidades verificadas a negociar,
 * que é o custo que reputação deveria ter.
 *
 * Um gráfico que mostrasse só o total inverteria a mensagem: premiaria
 * exatamente quem inflou.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Conduta from "@/components/conduta";

const agente = (over: Record<string, unknown> = {}) => ({
  label: "Neo",
  conduct: { opsOk: 4, volumeTotal: "1000", volumeAttested: "750", firstSeen: 1 },
  ...over,
});

describe("conduta dos agentes", () => {
  it("mostra cada agente pelo nome", () => {
    render(<Conduta agentes={[agente(), agente({ label: "Morpheus" })]} />);
    expect(screen.getByText("Neo")).toBeInTheDocument();
    expect(screen.getByText("Morpheus")).toBeInTheDocument();
  });

  it("dá a proporção do volume atestado", () => {
    render(<Conduta agentes={[agente()]} />);
    // 750 de 1000 — é o número que separa reputação de volume inflado.
    expect(screen.getByText(/75%/)).toBeInTheDocument();
  });

  it("a barra do atestado é proporcional, não decorativa", () => {
    render(<Conduta agentes={[agente()]} />);
    const barra = screen.getByTestId("barra-atestado-Neo");
    expect(barra).toHaveStyle({ width: "75%" });
  });

  it("escala as barras pelo maior volume entre os agentes", () => {
    render(
      <Conduta
        agentes={[
          agente({ label: "Neo", conduct: { opsOk: 1, volumeTotal: "500", volumeAttested: "500", firstSeen: 1 } }),
          agente({ label: "Morpheus", conduct: { opsOk: 1, volumeTotal: "1000", volumeAttested: "0", firstSeen: 1 } }),
        ]}
      />,
    );

    // Sem escala comum, dois agentes de volumes muito diferentes apareceriam
    // com barras iguais — e a comparação, que é o ponto, se perderia.
    expect(screen.getByTestId("barra-total-Neo")).toHaveStyle({ width: "50%" });
    expect(screen.getByTestId("barra-total-Morpheus")).toHaveStyle({ width: "100%" });
  });

  it("agente sem histórico é dito, não desenhado como zero", () => {
    render(
      <Conduta
        agentes={[agente({ conduct: { opsOk: 0, volumeTotal: "0", volumeAttested: "0", firstSeen: 0 } })]}
      />,
    );

    // Barra vazia parece medida; "nenhuma operação" é informação.
    expect(screen.getByText(/no operations yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("barra-total-Neo")).not.toBeInTheDocument();
  });

  it("volume todo atestado não mente sobre a proporção", () => {
    render(
      <Conduta
        agentes={[agente({ conduct: { opsOk: 2, volumeTotal: "800", volumeAttested: "800", firstSeen: 1 } })]}
      />,
    );
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });

  it("mostra as operações aprovadas", () => {
    render(<Conduta agentes={[agente()]} />);
    expect(screen.getByText(/4 approved/i)).toBeInTheDocument();
  });

  it("organização sem agentes não desenha gráfico vazio", () => {
    render(<Conduta agentes={[]} />);
    expect(screen.queryByRole("heading", { name: /conduct/i })).not.toBeInTheDocument();
  });
});
