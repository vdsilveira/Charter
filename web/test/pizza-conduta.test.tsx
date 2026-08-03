/**
 * A rosca de conduta, dentro do card de cada agente.
 *
 * A fatia cheia é o volume movido para contraparte **verificada**. É a única
 * das três medidas que não se infla sozinho: contagem de operações e volume
 * bruto sobem transacionando com a própria segunda conta; volume atestado exige
 * convencer entidades verificadas a negociar.
 *
 * Por isso o gráfico mostra essa proporção e não o total. Um desenho que
 * mostrasse volume bruto premiaria exatamente quem inflou.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PizzaConduta from "@/components/pizza-conduta";

describe("rosca de conduta", () => {
  it("mostra a proporção atestada em número", () => {
    render(<PizzaConduta total="1000" atestado="750" />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("o arco é proporcional, não decorativo", () => {
    const { container } = render(<PizzaConduta total="1000" atestado="250" />);
    const arco = container.querySelector("[data-testid='arco-atestado']");

    // Um quarto da circunferência preenchido. Sem isto o desenho seria enfeite,
    // e enfeite que parece medida é pior que nenhum gráfico.
    const [preenchido, resto] = (arco?.getAttribute("stroke-dasharray") ?? "").split(" ").map(Number);
    expect(preenchido / (preenchido + resto)).toBeCloseTo(0.25, 2);
  });

  it("tudo atestado fecha o círculo", () => {
    const { container } = render(<PizzaConduta total="800" atestado="800" />);
    const arco = container.querySelector("[data-testid='arco-atestado']");
    const [, resto] = (arco?.getAttribute("stroke-dasharray") ?? "").split(" ").map(Number);

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(resto).toBeCloseTo(0, 2);
  });

  it("nada atestado não desenha arco cheio por engano", () => {
    const { container } = render(<PizzaConduta total="900" atestado="0" />);
    const arco = container.querySelector("[data-testid='arco-atestado']");
    const [preenchido] = (arco?.getAttribute("stroke-dasharray") ?? "").split(" ").map(Number);

    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(preenchido).toBeCloseTo(0, 2);
  });

  it("sem operações, diz isso em vez de desenhar zero", () => {
    // Rosca vazia parece medida; ausência de histórico é informação — e é
    // justamente o que a credencial resolve, contratando contra a garantia.
    const { container } = render(<PizzaConduta total="0" atestado="0" />);

    expect(screen.getByText(/no operations yet/i)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("diz o que a fatia significa", () => {
    render(<PizzaConduta total="1000" atestado="750" />);
    // Sem legenda, uma rosca de duas fatias não diz nada.
    expect(screen.getByText(/verified counterparty/i)).toBeInTheDocument();
  });

  it("é legível por quem não vê o desenho", () => {
    render(<PizzaConduta total="1000" atestado="750" />);
    expect(screen.getByRole("img", { name: /75% .*verified/i })).toBeInTheDocument();
  });
});
