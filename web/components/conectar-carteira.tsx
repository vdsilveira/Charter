"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { encurtar } from "@/lib/utils";
import { freighter, redeCorreta, type FreighterApi } from "@/lib/carteira";

/**
 * Conexão da carteira do fundador.
 *
 * Aparece só onde alguém precisa assinar. A ausência do Freighter é situação
 * esperada — a maioria dos visitantes não tem a extensão, e consultar credencial
 * não precisa dela — então vira instrução, nunca exceção.
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
        if (vivo) setDisponivel(Boolean(r?.isConnected));
      } catch {
        if (vivo) setDisponivel(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [api]);

  async function conectar() {
    setErro(null);
    try {
      const wallet = await freighter(api);
      const acesso = await wallet.requestAccess?.();
      if (acesso?.error || !acesso?.address) {
        setErro(acesso?.error ?? "acesso recusado na carteira");
        return;
      }

      // A rede é checada já na conexão, não só na hora de assinar: melhor
      // avisar enquanto o usuário ainda está olhando para o botão.
      const { network } = (await wallet.getNetwork?.()) ?? {};
      if (!redeCorreta(network)) {
        setErro(`A carteira está em ${network ?? "rede desconhecida"} — troque para testnet.`);
        return;
      }

      setEndereco(acesso.address);
      onConectar?.(acesso.address);
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
    }
  }

  if (disponivel === null) return <span className="text-sm text-neutral-500">verificando…</span>;

  if (!disponivel) {
    return (
      <p className="max-w-xs text-sm text-neutral-600">
        Freighter não encontrado.{" "}
        <a className="underline" href="https://freighter.app/" target="_blank" rel="noreferrer">
          Instalar
        </a>{" "}
        para assinar como fundador. Consultar credencial não precisa de carteira.
      </p>
    );
  }

  if (endereco) {
    return (
      <span
        className="rounded-full bg-emerald-50 px-3 py-1 font-mono text-sm text-emerald-800"
        title={endereco}
      >
        {encurtar(endereco)}
      </span>
    );
  }

  return (
    <div className="space-y-2 text-right">
      <Button variant="outline" size="sm" onClick={conectar}>
        Conectar carteira
      </Button>
      {erro && (
        <p role="alert" className="text-sm text-red-800">
          {erro}
        </p>
      )}
    </div>
  );
}
