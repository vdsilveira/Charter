/**
 * Carteira do administrador — conectar, validar rede e assinar.
 *
 * O que precisa ser verdade: o fundador assina **com a própria carteira**, e a
 * aplicação nunca deixa passar uma assinatura feita na rede errada. Assinar em
 * mainnet uma transação que deveria ser de testnet é o tipo de erro que só se
 * descobre depois — e com dinheiro real do outro lado.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConectarCarteira from "@/components/conectar-carteira";
import { assinarEEnviar, redeCorreta } from "@/lib/carteira";

const ENDERECO = "GBBH2YATAUUFYAYUGAHLKOA4LFFHASVU7SUADEE5PFON7T33URAUBZHJ";

function apiFreighter(over: Record<string, unknown> = {}) {
  return {
    isConnected: async () => ({ isConnected: true }),
    requestAccess: async () => ({ address: ENDERECO }),
    getNetwork: async () => ({ network: "TESTNET", networkPassphrase: "Test SDF Network ; September 2015" }),
    signTransaction: async () => ({ signedTxXdr: "AAAA…assinada" }),
    ...over,
  };
}

describe("conexão de carteira", () => {
  it("sem Freighter instalado, instrui em vez de quebrar", async () => {
    render(<ConectarCarteira api={{ isConnected: async () => ({ isConnected: false }) }} />);

    expect(await screen.findByText(/freighter/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /instalar/i })).toBeInTheDocument();
  });

  it("conecta e mostra o endereço do fundador", async () => {
    const user = userEvent.setup();
    render(<ConectarCarteira api={apiFreighter()} />);

    await user.click(await screen.findByRole("button", { name: /conectar/i }));
    expect(await screen.findByText(/GBBH2YAT/)).toBeInTheDocument();
  });

  it("recusa de acesso vira aviso, não exceção", async () => {
    const user = userEvent.setup();
    render(<ConectarCarteira api={apiFreighter({ requestAccess: async () => ({ error: "User declined access" }) })} />);

    await user.click(await screen.findByRole("button", { name: /conectar/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/recus|declin/i));
  });

  it("avisa quando a carteira não está em testnet", async () => {
    const user = userEvent.setup();
    render(
      <ConectarCarteira
        api={apiFreighter({ getNetwork: async () => ({ network: "PUBLIC" }) })}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /conectar/i }));
    // Deixar passar seria pedir para o usuário assinar na rede errada.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/testnet/i));
  });

  it("informa o endereço conectado a quem precisa assinar", async () => {
    const user = userEvent.setup();
    const onConectar = vi.fn();
    render(<ConectarCarteira api={apiFreighter()} onConectar={onConectar} />);

    await user.click(await screen.findByRole("button", { name: /conectar/i }));
    await waitFor(() => expect(onConectar).toHaveBeenCalledWith(ENDERECO));
  });
});

describe("validação de rede", () => {
  it("aceita testnet", () => {
    expect(redeCorreta("TESTNET")).toBe(true);
  });

  it("recusa mainnet e qualquer outra", () => {
    expect(redeCorreta("PUBLIC")).toBe(false);
    expect(redeCorreta("FUTURENET")).toBe(false);
    expect(redeCorreta(undefined)).toBe(false);
  });
});

describe("assinatura pela carteira", () => {
  it("assina o XDR e envia o resultado", async () => {
    const signTransaction = vi.fn().mockResolvedValue({ signedTxXdr: "ASSINADA" });
    const enviar = vi.fn().mockResolvedValue({ hash: "abc123" });

    const r = await assinarEEnviar({
      xdr: "ORIGINAL",
      endereco: ENDERECO,
      api: apiFreighter({ signTransaction }),
      enviar,
    });

    expect(signTransaction).toHaveBeenCalled();
    expect(enviar).toHaveBeenCalledWith("ASSINADA");
    expect(r.hash).toBe("abc123");
  });

  it("recusa na carteira não vira transação enviada", async () => {
    const enviar = vi.fn();
    const api = apiFreighter({
      signTransaction: async () => ({ error: "User declined" }),
    });

    await expect(
      assinarEEnviar({ xdr: "ORIGINAL", endereco: ENDERECO, api, enviar }),
    ).rejects.toThrow(/declin|recus/i);
    // O ponto do teste: nada foi para a rede.
    expect(enviar).not.toHaveBeenCalled();
  });

  it("não assina se a carteira estiver na rede errada", async () => {
    const signTransaction = vi.fn();
    const api = apiFreighter({ getNetwork: async () => ({ network: "PUBLIC" }), signTransaction });

    await expect(
      assinarEEnviar({ xdr: "ORIGINAL", endereco: ENDERECO, api, enviar: vi.fn() }),
    ).rejects.toThrow(/testnet/i);
    expect(signTransaction).not.toHaveBeenCalled();
  });
});
