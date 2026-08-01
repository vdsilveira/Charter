"use client";

import { useCallback } from "react";
import Link from "next/link";
import PainelAgentes, { type AgenteResumo, type NovoAgente } from "@/components/painel-agentes";

/**
 * Administração da organização.
 *
 * A lista vem da credencial pública — a mesma que a contraparte lê. Mostrar ao
 * administrador exatamente o que o mundo vê evita a divergência clássica entre
 * o painel interno e a realidade da rede.
 */
export default function PainelOrg({ org }: { org: string }) {
  const carregar = useCallback(async (): Promise<AgenteResumo[]> => {
    const r = await fetch(`/api/leaderboard/${org}`);
    const b = await r.json();
    if (!r.ok) throw new Error(b?.error ?? "falha ao ler os agentes");

    const detalhes = await Promise.all(
      b.agents.map(async (a: { label: string; active: boolean }) => {
        const res = await fetch(`/api/agent/${org}/${a.label}`);
        const c = await res.json();
        return {
          label: a.label,
          active: a.active,
          allowedFns: c?.policy?.allowedFns ?? [],
          kybThreshold: c?.policy?.kybThreshold ?? "0",
        };
      }),
    );
    return detalhes;
  }, [org]);

  const adicionar = useCallback(
    async (a: NovoAgente) => {
      const r = await fetch(`/api/agente/${org}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(a),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error ?? "falha ao adicionar");
      return b;
    },
    [org],
  );

  const remover = useCallback(
    async (label: string) => {
      const r = await fetch(`/api/agente/${org}?label=${encodeURIComponent(label)}`, {
        method: "DELETE",
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error ?? "falha ao remover");
      return b;
    },
    [org],
  );

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <header>
        <p className="rotulo">administração</p>
        <h1 className="font-serif text-3xl">{org}</h1>
        <p className="mt-1 text-sm text-slate">
          Adicionar ou remover agentes altera a conta corporativa. Remover apaga a procuração
          da conta — não é só um rótulo que muda.{" "}
          <Link className="underline hover:text-seal" href={`/o/${org}`}>
            Ver credencial pública
          </Link>
        </p>
      </header>

      <PainelAgentes org={org} carregar={carregar} adicionar={adicionar} remover={remover} />
    </main>
  );
}
