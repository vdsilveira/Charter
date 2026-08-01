"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { encurtar } from "@/lib/utils";
import { freighter, redeCorreta, type FreighterApi } from "@/lib/carteira";

/**
 * Conexão da carteira do fundador.
 *
 * Ao montar, pergunta ao Freighter se este site **já** tem permissão: quem
 * entrou pela porta do site acabou de autorizar, e oferecer "Connect wallet" de
 * novo faz parecer que a conexão não pegou. `getAddress` responde isso sem
 * abrir pop-up — endereço vazio significa instalado, porém sem permissão.
 *
 * A ausência do Freighter é situação esperada — a maioria dos visitantes não
 * tem a extensão, e consultar credencial não precisa dela — então vira
 * instrução, nunca exceção.
 */
export default function ConectarCarteira({
  api,
  onConectar,
}: {
  api?: FreighterApi;
  onConectar?: (endereco: string) => void;
}) {
  const [disponivel, setDisponivel] = useState<boolean | null>(null);
  const [endereco, setEndereco] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const wallet = await freighter(api);
        const r = await wallet.isConnected();
        if (!vivo) return;
        setDisponivel(Boolean(r?.isConnected));
        if (!r?.isConnected) return;

        const { address } = (await wallet.getAddress?.()) ?? {};
        if (!vivo || !address) return;

        setEndereco(address);
        onConectar?.(address);

        // Rede errada com carteira já conectada é o caso mais traiçoeiro: tudo
        // parece pronto até a assinatura falhar. O aviso fica junto do endereço.
        const { network } = (await wallet.getNetwork?.()) ?? {};
        if (vivo && !redeCorreta(network)) {
          setErro(`Wallet is on ${network ?? "an unknown network"} — switch it to testnet.`);
        }
      } catch {
        if (vivo) setDisponivel(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // `onConectar` fora das dependências de propósito: um callback inline do pai
    // remontaria a sonda a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function conectar() {
    setErro(null);
    try {
      const wallet = await freighter(api);
      const acesso = await wallet.requestAccess?.();
      if (acesso?.error || !acesso?.address) {
        setErro(acesso?.error ?? "Wallet access declined.");
        return;
      }

      // A rede é checada já na conexão, não só na hora de assinar: melhor
      // avisar enquanto o usuário ainda está olhando para o botão.
      const { network } = (await wallet.getNetwork?.()) ?? {};
      if (!redeCorreta(network)) {
        setErro(`Wallet is on ${network ?? "an unknown network"} — switch it to testnet.`);
        return;
      }

      setEndereco(acesso.address);
      onConectar?.(acesso.address);
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
    }
  }

  if (disponivel === null) return <span className="text-sm text-slate">checking…</span>;

  if (!disponivel) {
    return (
      <p className="max-w-xs text-sm text-slate">
        Freighter not found.{" "}
        <a className="underline" href="https://freighter.app/" target="_blank" rel="noreferrer">
          Install it
        </a>{" "}
        to sign as the founder. Reading a credential needs no wallet.
      </p>
    );
  }

  if (endereco) {
    return (
      <div className="text-right">
        <span
          className="rounded-full bg-oksoft px-3 py-1 font-mono text-sm text-ok"
          title={endereco}
        >
          {encurtar(endereco)}
        </span>
        {erro && (
          <p role="alert" className="mt-1 text-sm text-deny">
            {erro}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-right">
      <Button variant="outline" size="sm" onClick={conectar}>
        Connect wallet
      </Button>
      {erro && (
        <p role="alert" className="text-sm text-deny">
          {erro}
        </p>
      )}
    </div>
  );
}
