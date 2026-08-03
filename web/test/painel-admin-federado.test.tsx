/**
 * Endereço federado na tela de emissão de claim.
 *
 * O campo pedia 56 caracteres copiados à mão, e o endereço certo é o do
 * **fundador** — não a conta corporativa, que é a que aparece em toda parte.
 * Copiar o errado gera uma emissão válida para a conta errada, e o selo continua
 * negativo sem dizer por quê.
 *
 * Com `founder*Matrix*domínio`, quem emite escreve o nome da organização e vê o
 * endereço resolvido antes de assinar.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PainelAdmin from "@/components/painel-admin";

const ADMIN = "GBBH2YATAUUFYAYUGAHLKOA4LFFHASVU7SUADEE5PFON7T33URAUBZHJ";
const FUNDADOR = "GCCTAKNG7GHF4SYPXGY25DCK7RLLPKMUVODCDUYZNYYVD2XWDIZXGGLQ";

const conectada = () => ({
  isConnected: async () => ({ isConnected: true }),
  getAddress: async () => ({ address: ADMIN }),
});

async function preencher(user: ReturnType<typeof userEvent.setup>, valor: string) {
  await screen.findByText(ADMIN);
  await user.type(screen.getByLabelText(/stellar address/i), valor);
  await user.click(screen.getByRole("button", { name: /issue claim/i }));
}

describe("emissão por endereço federado", () => {
  it("resolve o nome e emite para o endereço resolvido", async () => {
    const user = userEvent.setup();
    const emitir = vi.fn().mockResolvedValue({ conta: FUNDADOR, verificado: true });
    const resolver = vi.fn().mockResolvedValue(FUNDADOR);

    render(<PainelAdmin api={conectada()} emitir={emitir} resolver={resolver} />);
    await preencher(user, "founder*Matrix*charter.local");

    await waitFor(() => expect(emitir).toHaveBeenCalled());
    expect(resolver).toHaveBeenCalledWith("founder*Matrix*charter.local");
    // O que vai para a cadeia é o endereço, nunca o apelido.
    expect(emitir.mock.calls[0][0]).toBe(FUNDADOR);
  });

  it("mostra o endereço resolvido junto do resultado", async () => {
    const user = userEvent.setup();
    render(
      <PainelAdmin
        api={conectada()}
        emitir={vi.fn().mockResolvedValue({ conta: FUNDADOR, verificado: true })}
        resolver={vi.fn().mockResolvedValue(FUNDADOR)}
      />,
    );
    await preencher(user, "founder*Matrix*charter.local");

    expect(await screen.findByText(new RegExp(FUNDADOR.slice(0, 10)))).toBeInTheDocument();
  });

  it("nome que não resolve vira aviso, e nada é emitido", async () => {
    const user = userEvent.setup();
    const emitir = vi.fn();
    render(
      <PainelAdmin
        api={conectada()}
        emitir={emitir}
        resolver={vi.fn().mockRejectedValue(new Error("agente não encontrado"))}
      />,
    );
    await preencher(user, "founder*Fantasma*charter.local");

    expect(emitir).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/não encontrado|not found/i);
  });

  it("endereço cru continua funcionando sem resolver nada", async () => {
    const user = userEvent.setup();
    const emitir = vi.fn().mockResolvedValue({ conta: FUNDADOR, verificado: true });
    const resolver = vi.fn();

    render(<PainelAdmin api={conectada()} emitir={emitir} resolver={resolver} />);
    await preencher(user, FUNDADOR);

    await waitFor(() => expect(emitir).toHaveBeenCalled());
    expect(emitir.mock.calls[0][0]).toBe(FUNDADOR);
    expect(emitir.mock.calls[0][1]).toBe(ADMIN);
    expect(resolver).not.toHaveBeenCalled();
  });
});
