"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { encurtar } from "@/lib/utils";

/** Superfície mínima do Freighter que usamos — injetável para teste. */
export interface FreighterApi {
  isConnected: () => Promise<{ isConnected: boolean }>;
  requestAccess?: () => Promise<{ address?: string; error?: string }>;
}

/**
 * Conexão de carteira do fundador.
 *
 * Aparece só onde alguém precisa **assinar**. A ausência do Freighter é
 * situação esperada — a maioria dos visitantes não tem a extensão — e por isso
 * vira instrução, nunca exceção.
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
        const mod = api ?? (await import("@stellar/freighter-api"));
        const r = await mod.isConnected();
        if (vivo) setDisponivel(Boolean(r?.isConnected));
      } catch {
        if (vivo) setDisponivel(false);
      }
    })();
    return () => { vivo = false; };
  }, [api]);

  async function conectar() {
    setErro(null);
    try {
      const mod = api ?? (await import("@stellar/freighter-api"));
      const r = await mod.requestAccess!();
      if (r?.error || !r?.address) {
        setErro(r?.error ?? "acesso recusado na carteira");
        return;
      }
      setEndereco(r.address);
      onConectar?.(r.address);
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
    }
  }

  if (disponivel === null) return <span className="text-sm text-neutral-500">verificando…</span>;

  if (!disponivel) {
    return (
      <p className="text-sm text-neutral-600">
        Freighter não encontrado.{" "}
        <a
          className="underline"
          href="https://freighter.app/"
          target="_blank"
          rel="noreferrer"
        >
          Instalar
        </a>{" "}
        para assinar como fundador. A consulta de credenciais não precisa de carteira.
      </p>
    );
  }

  if (endereco) {
    return (
      <span className="font-mono text-sm" title={endereco}>
        {encurtar(endereco)}
      </span>
    );
  }

  return (
    <div className="space-y-2">
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
