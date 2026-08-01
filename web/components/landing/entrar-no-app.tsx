"use client";

import { useState } from "react";
import { freighter, redeCorreta, type FreighterApi } from "@/lib/carteira";

/**
 * Porta de entrada do site para a aplicação.
 *
 * Conecta a carteira **antes** de navegar. Mandar o visitante para a tela de
 * constituição sem carteira produz o pior roteiro possível: ele preenche o
 * formulário inteiro e só descobre no fim que não tem como assinar.
 *
 * A credencial pública (`/o/[org]`) fica de fora disso de propósito — quem
 * consulta um agente ainda não é cliente, e exigir carteira ali devolveria o
 * problema que o produto resolve.
 */
export default function EntrarNoApp({
  destino,
  children,
  className,
  api,
  navegar,
}: {
  destino: string;
  children: React.ReactNode;
  className?: string;
  /** Injetáveis para teste. */
  api?: FreighterApi;
  navegar?: (destino: string) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<React.ReactNode>(null);
  const [conectado, setConectado] = useState(false);

  // Navegação completa em vez do router do Next: sair do site para a aplicação
  // troca de layout e de tema, e um recarregamento evita carregar o chrome de
  // um lado com os tokens do outro.
  const ir = navegar ?? ((d: string) => window.location.assign(d));

  async function entrar() {
    // Já autorizado nesta sessão: repetir o pedido só faria a carteira abrir
    // um pop-up à toa.
    if (conectado) {
      ir(destino);
      return;
    }

    setErro(null);
    setOcupado(true);
    try {
      const wallet = await freighter(api);

      const { isConnected } = await wallet.isConnected();
      if (!isConnected) {
        setErro(
          <>
            Freighter not found.{" "}
            <a className="underline" href="https://freighter.app/" target="_blank" rel="noreferrer">
              Install it
            </a>{" "}
            to sign as founder — reading a credential needs no wallet.
          </>,
        );
        return;
      }

      const acesso = await wallet.requestAccess?.();
      if (acesso?.error || !acesso?.address) {
        setErro(acesso?.error ?? "Wallet access declined.");
        return;
      }

      const { network } = (await wallet.getNetwork?.()) ?? {};
      if (!redeCorreta(network)) {
        setErro(`Your wallet is on ${network ?? "an unknown network"} — switch to testnet.`);
        return;
      }

      setConectado(true);
      ir(destino);
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <button type="button" onClick={entrar} disabled={ocupado} className={className}>
        {ocupado ? "Connecting…" : children}
      </button>

      {erro && (
        <p
          role="alert"
          className="mt-2 max-w-xs font-mono text-[11px] leading-relaxed text-destructive"
        >
          {erro}
        </p>
      )}
    </>
  );
}
