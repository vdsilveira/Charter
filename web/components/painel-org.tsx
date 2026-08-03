"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PainelAgentes, { type AgenteResumo, type NovoAgente } from "@/components/painel-agentes";
import Tesouro from "@/components/tesouro";
import { assinarEEnviar, freighter, type FreighterApi } from "@/lib/carteira";

/**
 * Administração da organização.
 *
 * A lista vem da credencial pública — a mesma que a contraparte lê. Mostrar ao
 * administrador exatamente o que o mundo vê evita a divergência clássica entre
 * o painel interno e a realidade da rede.
 *
 * Quem assina é a carteira do fundador, como na constituição: o servidor monta
 * e envia, mas não tem chave nenhuma no caminho.
 */
export default function PainelOrg({ org, api }: { org: string; api?: FreighterApi }) {
  const [fundador, setFundador] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const wallet = await freighter(api);
        const { address } = (await wallet.getAddress?.()) ?? {};
        if (vivo && address) setFundador(address);
      } catch {
        /* sem carteira: as ações explicam ao serem usadas */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [api]);

  /** Monta no servidor, assina na carteira, envia. */
  const assinarEEnviarMontagem = useCallback(
    async (resposta: Response) => {
      const { xdr, error } = await resposta.json();
      if (!resposta.ok) throw new Error(error ?? "could not build the transaction");
      if (!fundador) throw new Error("Connect your wallet to sign as the founder.");

      return assinarEEnviar({
        xdr,
        endereco: fundador,
        enviar: async (assinada) => {
          const envio = await fetch("/api/tx", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ xdr: assinada }),
          });
          const corpo = await envio.json();
          if (!envio.ok) throw new Error(corpo?.error ?? "the network refused the transaction");
          return corpo as { hash: string };
        },
      });
    },
    [fundador],
  );

  const carregar = useCallback(async (): Promise<AgenteResumo[]> => {
    // Os rótulos vêm de `org_of`: o registro é quem sabe quem está em vigor
    // agora, incluindo adições e remoções posteriores à constituição.
    const r = await fetch(`/api/leaderboard/${org}`);
    const b = await r.json();
    if (!r.ok) throw new Error(b?.error ?? "could not read the agents");

    const detalhes = await Promise.all(
      b.agents.map(async (a: { label: string; active: boolean }) => {
        const res = await fetch(`/api/agent/${org}/${a.label}`);
        const c = await res.json();
        return {
          label: a.label,
          active: a.active,
          allowedFns: c?.policy?.allowedFns ?? [],
          kybThreshold: c?.policy?.kybThreshold ?? "0",
          maxVolume: c?.policy?.maxVolume ?? null,
        };
      }),
    );
    return detalhes;
  }, [org]);

  const adicionar = useCallback(
    async (a: NovoAgente) =>
      assinarEEnviarMontagem(
        await fetch(`/api/agente/${org}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...a, fundador }),
        }),
      ),
    [org, fundador, assinarEEnviarMontagem],
  );

  const remover = useCallback(
    async (label: string) =>
      assinarEEnviarMontagem(
        await fetch(
          `/api/agente/${org}?label=${encodeURIComponent(label)}&fundador=${fundador ?? ""}`,
          { method: "DELETE" },
        ),
      ),
    [org, fundador, assinarEEnviarMontagem],
  );

  const limitar = useCallback(
    async (label: string, teto: string | null) =>
      assinarEEnviarMontagem(
        await fetch("/api/limite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ org, label, teto, fundador }),
        }),
      ),
    [org, fundador, assinarEEnviarMontagem],
  );

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <header>
        <p className="rotulo">administration</p>
        <h1 className="font-serif text-3xl">{org}</h1>
        <p className="mt-1 text-sm text-slate">
          Adding or removing agents changes the corporate account. Removing erases the power of
          attorney from the account — it is not just a label that changes.{" "}
          {fundador && (
            <>
              Signing as <span className="font-mono text-xs">{fundador.slice(0, 8)}…</span>.{" "}
            </>
          )}
          <Link className="underline hover:text-seal" href={`/o/${org}`}>
            See the public credential
          </Link>
        </p>
      </header>

      {/* Antes dos agentes: sem saldo, a procuração está certa e a
          transferência falha assim mesmo. */}
      <Tesouro org={org} api={api} />

      <PainelAgentes
        org={org}
        carregar={carregar}
        adicionar={adicionar}
        remover={remover}
        limitar={limitar}
      />
    </main>
  );
}
