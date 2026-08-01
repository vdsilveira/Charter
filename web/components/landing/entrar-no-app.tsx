"use client";

import { useCallback, useEffect, useState } from "react";
import { freighter, redeCorreta, type FreighterApi } from "@/lib/carteira";

/**
 * Porta de entrada do site para a aplicação.
 *
 * Quem já autorizou a carteira passa direto — parar alguém que está pronto é
 * atrito à toa. Quem não autorizou vê a página escurecer e uma caixa explicando
 * para onde vai e por que a carteira é necessária, em vez de descobrir isso
 * depois de preencher um formulário inteiro.
 *
 * A distinção entre "instalado" e "autorizado" vem do próprio Freighter:
 * `getAddress` devolve endereço vazio enquanto o site não tiver permissão, e é
 * por isso que ele serve de teste silencioso — `requestAccess` abriria um
 * pop-up só para descobrir o mesmo.
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
  const [caixaAberta, setCaixaAberta] = useState(false);
  const [semExtensao, setSemExtensao] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Navegação completa em vez do router do Next: sair do site para a aplicação
  // troca layout e tema, e o recarregamento evita montar o chrome de um lado
  // com os tokens do outro.
  const ir = navegar ?? ((d: string) => window.location.assign(d));

  const fechar = useCallback(() => {
    setCaixaAberta(false);
    setErro(null);
  }, []);

  useEffect(() => {
    if (!caixaAberta) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [caixaAberta, fechar]);

  /** Verifica a rede e navega. Devolve o motivo quando não dá para seguir. */
  async function seguir(wallet: FreighterApi): Promise<string | null> {
    const { network } = (await wallet.getNetwork?.()) ?? {};
    if (!redeCorreta(network)) {
      return `Your wallet is on ${network ?? "an unknown network"} — switch it to testnet and try again.`;
    }
    ir(destino);
    return null;
  }

  async function aoClicar() {
    setErro(null);
    setOcupado(true);
    try {
      const wallet = await freighter(api);

      const { isConnected } = await wallet.isConnected();
      if (!isConnected) {
        setSemExtensao(true);
        setCaixaAberta(true);
        return;
      }

      // Endereço não-vazio significa que este site já tem permissão.
      const { address } = (await wallet.getAddress?.()) ?? {};
      if (address) {
        const motivo = await seguir(wallet);
        if (motivo) {
          setErro(motivo);
          setCaixaAberta(true);
        }
        return;
      }

      setSemExtensao(false);
      setCaixaAberta(true);
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
      setCaixaAberta(true);
    } finally {
      setOcupado(false);
    }
  }

  async function conectar() {
    setErro(null);
    setOcupado(true);
    try {
      const wallet = await freighter(api);
      const acesso = await wallet.requestAccess?.();
      if (acesso?.error || !acesso?.address) {
        setErro(acesso?.error ?? "Wallet access declined.");
        return;
      }
      const motivo = await seguir(wallet);
      if (motivo) setErro(motivo);
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <button type="button" onClick={aoClicar} disabled={ocupado} className={className}>
        {children}
      </button>

      {caixaAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Escurece e desfoca o site: o pedido de conexão fica sendo a única
              coisa em foco, e um clique fora desiste sem custo. */}
          <button
            type="button"
            aria-label="Close"
            onClick={fechar}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-conexao"
            className="tema-site relative w-full max-w-md rounded-lg border border-foreground/15 bg-card p-8 shadow-2xl"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Stellar testnet
            </p>
            <h2 id="titulo-conexao" className="mt-3 font-display text-2xl leading-tight">
              {semExtensao ? "Freighter not found" : "Connect your wallet"}
            </h2>

            {semExtensao ? (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                You&apos;ll need the{" "}
                <a
                  className="underline hover:text-foreground"
                  href="https://freighter.app/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Freighter extension
                </a>{" "}
                to sign as the founder. Reading a public credential needs no wallet — you can
                browse one without installing anything.
              </p>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                You&apos;re about to open a screen where you sign: chartering an organization and
                delegating to agents are on-chain operations. Nothing is signed now — this only
                grants the page permission to see your address.
              </p>
            )}

            {erro && (
              <p
                role="alert"
                className="mt-5 rounded-md border border-destructive/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-destructive"
              >
                {erro}
              </p>
            )}

            <div className="mt-7 flex flex-wrap gap-3">
              {!semExtensao && (
                <button
                  type="button"
                  onClick={conectar}
                  disabled={ocupado}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {ocupado ? "Waiting for wallet…" : "Connect Freighter"}
                </button>
              )}
              <button
                type="button"
                onClick={fechar}
                className="inline-flex h-11 items-center justify-center rounded-full border border-foreground/20 px-6 text-sm transition-colors hover:bg-foreground/5"
              >
                {semExtensao ? "Back to the site" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
