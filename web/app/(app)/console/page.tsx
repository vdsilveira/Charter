"use client";

import { useCallback } from "react";
import Feed, { type Decisao } from "@/components/feed";
import Leaderboard, { type LinhaAgente } from "@/components/leaderboard";
import PagamentoForm from "@/components/pagamento-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ORG = process.env.NEXT_PUBLIC_ORG ?? "alphafund";

export default function ConsolePage() {
  const carregarFeed = useCallback(async (): Promise<Decisao[]> => {
    const r = await fetch("/api/feed");
    const b = await r.json();
    if (!r.ok) throw new Error(b?.error ?? "falha ao ler o feed");
    return b.decisions;
  }, []);

  const carregarRanking = useCallback(async (): Promise<LinhaAgente[]> => {
    const r = await fetch(`/api/leaderboard/${ORG}`);
    const b = await r.json();
    if (!r.ok) throw new Error(b?.error ?? "falha ao ler o ranking");
    return b.agents;
  }, []);

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
    if (!r.ok) throw new Error(b?.error ?? "falha ao enviar");
    return b;
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <header>
        <p className="rotulo">organização</p>
        <h1 className="font-serif text-3xl">{ORG}</h1>
        <p className="mt-1 text-sm text-slate">
          Toda decisão abaixo veio da cadeia. Nada é reconstruído de banco próprio.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagamento do agente</CardTitle>
          <CardDescription>
            A simulação diz se a rede aceitaria — antes de gastar transação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PagamentoForm simular={simular} enviar={enviar} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decisões de política</CardTitle>
          <CardDescription>Só operações aprovadas aparecem: a recusa reverte a transação.</CardDescription>
        </CardHeader>
        <CardContent>
          <Feed carregar={carregarFeed} intervaloMs={5000} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agentes</CardTitle>
          <CardDescription>
            Ordenado por volume com contraparte verificada — a métrica que custa caro inflar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Leaderboard carregar={carregarRanking} />
        </CardContent>
      </Card>
    </main>
  );
}
