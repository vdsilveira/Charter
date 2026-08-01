/**
 * Credencial pública e conexão de carteira.
 *
 * A página pública é para a **contraparte**, que não é cliente e não tem
 * carteira. Se ela exigisse conexão para mostrar poderes e conduta, devolveria
 * o problema que o produto resolve: confiar em quem opera a organização.
 *
 * A carteira aparece só onde alguém precisa **assinar** — e a ausência do
 * Freighter tem de virar instrução, não exceção.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CredencialAgente from "@/components/credencial-agente";

const credencial = {
  org: "alphafund",
  label: "trader",
  account: "CC26I3KF3WWHIGQWIQH65HSOROOUW6XXG2FGTZFKAEWKYPGGHLI6OQR6",
  active: true,
  orgVerified: false,
  policy: {
    allowedFns: ["transfer"],
    kybThreshold: "500",
    identityRegistry: "CDKSINTK…",
    claimTopic: 1,
  },
  conduct: { opsOk: 3, volumeTotal: "1000", volumeAttested: "900", firstSeen: 1785540433 },
};

describe("credencial do agente", () => {
  it("mostra poderes, limiar e conduta sem exigir carteira", () => {
    render(<CredencialAgente credencial={credencial} />);

    expect(screen.getByText(/transfer/)).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();
    expect(screen.getByText(/900/)).toBeInTheDocument();
    // Nada de "conecte sua carteira" numa página feita para quem não é cliente.
    expect(screen.queryByRole("button", { name: /conectar/i })).not.toBeInTheDocument();
  });

  it("destaca volume com contraparte verificada", () => {
    render(<CredencialAgente credencial={credencial} />);
    const destaque = screen.getByTestId("volume-attested");
    expect(destaque).toHaveTextContent("900");
  });

  it("informa organização não verificada em vez de omitir", () => {
    render(<CredencialAgente credencial={credencial} />);
    // Omitir seria pior que informar: a contraparte precisa saber que a
    // organização não tem claim, e decidir por conta própria.
    expect(screen.getByText(/não verificad/i)).toBeInTheDocument();
  });

  it("agente com escopo vazio aparece como incapaz de mover valor", () => {
    render(
      <CredencialAgente
        credencial={{ ...credencial, label: "auditor", policy: { ...credencial.policy, allowedFns: [] } }}
      />,
    );
    expect(screen.getByText(/não pode invocar|nenhuma função/i)).toBeInTheDocument();
  });

  it("agente revogado é marcado, não apagado", () => {
    render(<CredencialAgente credencial={{ ...credencial, active: false }} />);
    expect(screen.getByText(/revogado/i)).toBeInTheDocument();
    // Continua mostrando os poderes de antes: revogado ≠ inexistente.
    expect(screen.getByText(/transfer/)).toBeInTheDocument();
  });
});
