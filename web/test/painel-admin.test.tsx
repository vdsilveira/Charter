/**
 * Tela de emissão de claim KYB.
 *
 * O que precisa ser verdade na interface: ela diz **qual** endereço verificar
 * (o do fundador, não o da conta corporativa — foi a confusão que motivou esta
 * tela), não deixa emitir sem carteira, e não some com o erro quando a rede
 * recusa.
 *
 * A recusa de quem não é admin acontece no servidor e está coberta em
 * `admin.test.ts`; aqui a tela nem tenta adivinhar quem é.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PainelAdmin from "@/components/painel-admin";

const ADMIN = "GBBH2YATAUUFYAYUGAHLKOA4LFFHASVU7SUADEE5PFON7T33URAUBZHJ";
const ALVO = "GAFASLN5AWEKSDNXLRUH525N2FSNTBFLFG53EPUEOKRQCWUI2BLT5JES";

const conectada = () => ({
  isConnected: async () => ({ isConnected: true }),
  getAddress: async () => ({ address: ADMIN }),
});

describe("emissão de claim KYB", () => {
  it("explica que o endereço é o do fundador, não o da conta corporativa", async () => {
    render(<PainelAdmin api={conectada()} emitir={vi.fn()} />);
    // A confusão que motivou a tela: a conta corporativa aparece em todo lugar,
    // e é o fundador que o selo lê.
    expect(await screen.findByText(/not the corporate account/i)).toBeInTheDocument();
  });

  it("emite para a conta informada, com a carteira conectada", async () => {
    const user = userEvent.setup();
    const emitir = vi.fn().mockResolvedValue({ conta: ALVO, verificado: true });
    render(<PainelAdmin api={conectada()} emitir={emitir} />);

    await screen.findByText(ADMIN);
    await user.type(screen.getByLabelText(/stellar address/i), ALVO);
    await user.click(screen.getByRole("button", { name: /issue claim/i }));

    await waitFor(() => expect(emitir).toHaveBeenCalled());
    expect(emitir.mock.calls[0][0]).toBe(ALVO);
    expect(emitir.mock.calls[0][1]).toBe(ADMIN);
  });

  it("sem carteira conectada, explica em vez de emitir", async () => {
    const user = userEvent.setup();
    const emitir = vi.fn();
    render(
      <PainelAdmin
        api={{ isConnected: async () => ({ isConnected: true }), getAddress: async () => ({ address: "" }) }}
        emitir={emitir}
      />,
    );

    await user.type(screen.getByLabelText(/stellar address/i), ALVO);
    await user.click(screen.getByRole("button", { name: /issue claim/i }));

    expect(emitir).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/connect/i);
  });

  it("recusa do servidor aparece na tela", async () => {
    const user = userEvent.setup();
    const emitir = vi.fn().mockRejectedValue(new Error("this wallet is not the platform administrator"));
    render(<PainelAdmin api={conectada()} emitir={emitir} />);

    await screen.findByText(ADMIN);
    await user.type(screen.getByLabelText(/stellar address/i), ALVO);
    await user.click(screen.getByRole("button", { name: /issue claim/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not the platform administrator/i);
  });

  it("conta já verificada é dita como tal, não como nova emissão", async () => {
    const user = userEvent.setup();
    const emitir = vi.fn().mockResolvedValue({ conta: ALVO, verificado: true, jaEstava: true });
    render(<PainelAdmin api={conectada()} emitir={emitir} />);

    await screen.findByText(ADMIN);
    await user.type(screen.getByLabelText(/stellar address/i), ALVO);
    await user.click(screen.getByRole("button", { name: /issue claim/i }));

    // Emitir de novo criaria uma segunda identidade e gastaria taxa à toa.
    expect(await screen.findByText(/already verified/i)).toBeInTheDocument();
  });

  it("claim emitido que não verifica não é anunciado como sucesso", async () => {
    const user = userEvent.setup();
    const emitir = vi.fn().mockResolvedValue({ conta: ALVO, verificado: false });
    render(<PainelAdmin api={conectada()} emitir={emitir} />);

    await screen.findByText(ADMIN);
    await user.type(screen.getByLabelText(/stellar address/i), ALVO);
    await user.click(screen.getByRole("button", { name: /issue claim/i }));

    expect(await screen.findByText(/still refuses/i)).toBeInTheDocument();
  });
});
