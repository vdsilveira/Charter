/**
 * Folha confidencial.
 *
 * O que precisa ser verdade na tela: o operador entende **o que fica oculto** e
 * o que não fica. Na rede aparece quem pagou quem; o valor, não. Deixar isso
 * ambíguo seria pior que não ter a tela — alguém pagaria achando que a
 * contraparte também está escondida.
 *
 * E a espera precisa ser anunciada: a prova leva segundos, e um botão que trava
 * sem dizer nada passa por travamento.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Folha from "@/components/folha";

const DESTINO = "GBG6UX7LDUU5ZAVRASDVB3EP7BXKM7ZXVHZQWPPPQXTVVUOSNRCWCGQO";

const props = (over: Record<string, unknown> = {}) => ({
  lerSaldo: vi.fn().mockResolvedValue({ gastavel: "1000", tesouro: "GTES…", token: "CTOK…" }),
  pagar: vi.fn().mockResolvedValue({ hash: "abc123", para: DESTINO, valor: "400" }),
  ...over,
});

describe("folha confidencial", () => {
  it("mostra o saldo do tesouro confidencial", async () => {
    render(<Folha {...props()} />);
    expect(await screen.findByText("1000")).toBeInTheDocument();
  });

  it("diz o que fica oculto e o que não fica", async () => {
    render(<Folha {...props()} />);
    // Sem isto, alguém pagaria achando que a contraparte também está escondida.
    expect(await screen.findByText(/who paid whom is visible/i)).toBeInTheDocument();
  });

  it("paga com o valor informado", async () => {
    const user = userEvent.setup();
    const pagar = vi.fn().mockResolvedValue({ hash: "abc", para: DESTINO, valor: "400" });
    render(<Folha {...props({ pagar })} />);

    await screen.findByText("1000");
    await user.type(screen.getByLabelText(/recipient/i), DESTINO);
    await user.type(screen.getByLabelText(/amount/i), "400");
    await user.click(screen.getByRole("button", { name: /pay privately/i }));

    await waitFor(() => expect(pagar).toHaveBeenCalledWith(DESTINO, "400"));
  });

  it("anuncia a espera da prova", async () => {
    const user = userEvent.setup();
    let resolver: (v: unknown) => void = () => {};
    const pagar = vi.fn(() => new Promise((r) => (resolver = r)));
    render(<Folha {...props({ pagar })} />);

    await screen.findByText("1000");
    await user.type(screen.getByLabelText(/recipient/i), DESTINO);
    await user.type(screen.getByLabelText(/amount/i), "400");
    await user.click(screen.getByRole("button", { name: /pay privately/i }));

    // A prova leva segundos; botão travado sem aviso passa por travamento.
    expect(await screen.findByText(/proving/i)).toBeInTheDocument();
    resolver({ hash: "x", para: DESTINO, valor: "400" });
  });

  it("destinatário sem conta confidencial vira explicação, não erro cru", async () => {
    const user = userEvent.setup();
    const pagar = vi
      .fn()
      .mockRejectedValue(new Error("The recipient has no confidential account."));
    render(<Folha {...props({ pagar })} />);

    await screen.findByText("1000");
    await user.type(screen.getByLabelText(/recipient/i), DESTINO);
    await user.type(screen.getByLabelText(/amount/i), "400");
    await user.click(screen.getByRole("button", { name: /pay privately/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no confidential account/i);
  });

  it("relê o saldo depois de pagar", async () => {
    const user = userEvent.setup();
    const lerSaldo = vi
      .fn()
      .mockResolvedValueOnce({ gastavel: "1000", tesouro: "G", token: "C" })
      .mockResolvedValueOnce({ gastavel: "600", tesouro: "G", token: "C" });
    render(<Folha {...props({ lerSaldo })} />);

    await screen.findByText("1000");
    await user.type(screen.getByLabelText(/recipient/i), DESTINO);
    await user.type(screen.getByLabelText(/amount/i), "400");
    await user.click(screen.getByRole("button", { name: /pay privately/i }));

    expect(await screen.findByText("600")).toBeInTheDocument();
  });

  it("diz que a chave do tesouro vive no servidor", async () => {
    render(<Folha {...props()} />);
    // A prova exige o segredo, e o Freighter não o expõe. Dar a entender que a
    // carteira do fundador assinou seria mentira.
    expect(await screen.findByText(/server/i)).toBeInTheDocument();
  });
});
