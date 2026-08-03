"use client";

import { useCallback } from "react";
import Feed, { type Decisao } from "@/components/feed";
import Leaderboard, { type LinhaAgente } from "@/components/leaderboard";
import PagamentoForm from "@/components/pagamento-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Console de **uma** organização — a que `seletor-org` resolveu pela carteira.
 *
 * Os agentes vêm de `org_of`, não de um padrão no código. Era o `trader,auditor`
 * fixo que fazia um agente de nome próprio não existir para a interface.
 */
export default function ConsoleDaOrg({ org: ORG }: { org: string }) {
  const carregarFeed = useCallback(async (): Promise<Decisao[]> => {
    const r = await fetch(`/api/feed?org=${encodeURIComponent(ORG)}`);
    const b = await r.json();
    if (!r.ok) throw new Error(b?.error ?? "could not read the feed");
    return b.decisions;
  }, [ORG]);

  const carregarRanking = useCallback(async (): Promise<LinhaAgente[]> => {
    const info = await fetch(`/api/org/${ORG}`);
    const dados = await info.json();
    if (!info.ok) throw new Error(dados?.error ?? "could not read the organization");

    const rotulos = (dados.agents ?? []).join(",");
    if (!rotulos) return [];

    const r = await fetch(`/api/leaderboard/${ORG}?agents=${encodeURIComponent(rotulos)}`);
    const b = await r.json();
    if (!r.ok) throw new Error(b?.error ?? "could not read the ranking");
    return b.agents;
  }, [ORG]);

  const simular = useCallback(async (p: { destinatario: string; valor: string }) => {
    const r = await fetch("/api/pagamento/simular", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
    });
    return r.json();
  }, []);

  const enviar = useCallback(async (p: { destinatario: string; valor: string }) => {
    const r = await fetch("/api/pagamento", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b?.error ?? "could not send the payment");
    return b;
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <header>
        <p className="rotulo">organization</p>
        <h1 className="font-serif text-3xl">{ORG}</h1>
        <p className="mt-1 text-sm text-slate">
          Every decision below came from the chain. Nothing is reconstructed from a database of
          our own.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent payment</CardTitle>
          <CardDescription>
            The simulation tells you whether the network would accept it — before you spend a
            transaction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PagamentoForm simular={simular} enviar={enviar} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Policy decisions</CardTitle>
          <CardDescription>
            Only approved operations appear: a refusal reverts the transaction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Feed carregar={carregarFeed} intervaloMs={5000} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agents</CardTitle>
          <CardDescription>
            Ranked by volume with a verified counterparty — the metric that is expensive to inflate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Leaderboard carregar={carregarRanking} />
        </CardContent>
      </Card>
    </main>
  );
}
