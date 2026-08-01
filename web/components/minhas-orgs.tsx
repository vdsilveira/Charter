"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { freighter, type FreighterApi } from "@/lib/carteira";
import type { OrgDaCarteira } from "@/lib/minhas-orgs";

async function carregarPadrao(fundador: string): Promise<OrgDaCarteira[]> {
  const r = await fetch(`/api/minhas-orgs?fundador=${encodeURIComponent(fundador)}`);
  const b = await r.json();
  if (!r.ok) throw new Error(b?.error ?? "could not read your organizations");
  return b.orgs;
}

/**
 * O que esta carteira fundou.
 *
 * Faltava um lugar assim: o console apontava para uma organização fixa em
 * variável de ambiente, então quem constituía a própria não a via em tela
 * nenhuma. A lista sai do histórico da conta — o registro não tem índice por
 * fundador, e inventar um banco só para isso contradiria o argumento do
 * produto.
 */
export default function MinhasOrgs({
  api,
  carregar = carregarPadrao,
}: {
  api?: FreighterApi;
  carregar?: (fundador: string) => Promise<OrgDaCarteira[]>;
}) {
  const [fundador, setFundador] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgDaCarteira[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const wallet = await freighter(api);
        const { address } = (await wallet.getAddress?.()) ?? {};
        if (!vivo) return;
        if (!address) return setFundador("");

        setFundador(address);
        setOrgs(await carregar(address));
      } catch (e) {
        // "Não consegui ler" e "você não tem" são coisas diferentes; confundir
        // as duas faria alguém concluir que perdeu a organização.
        if (vivo) setErro(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [api, carregar]);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <header>
        <p className="rotulo">your wallet</p>
        <h1 className="font-serif text-3xl">Organizations</h1>
        <p className="mt-1 text-sm text-slate">
          Read from your account history on the network — one entry per organization you
          chartered.
        </p>
      </header>

      {erro && (
        <p role="alert" className="rounded-md bg-denysoft px-3 py-2 text-sm text-deny">
          Could not read the chain: {erro}
        </p>
      )}

      {fundador === "" && (
        <p className="rounded-lg border border-hairline bg-surface px-5 py-8 text-center text-sm text-slate">
          Connect your wallet to see the organizations it chartered.
        </p>
      )}

      {fundador && orgs === null && !erro && <p className="text-sm text-slate">loading…</p>}

      {orgs?.length === 0 && (
        <p className="rounded-lg border border-hairline bg-surface px-5 py-8 text-center text-sm text-slate">
          You haven&apos;t chartered any organizations with this wallet yet.{" "}
          <Link className="underline hover:text-seal" href="/constituir">
            Charter one
          </Link>
          .
        </p>
      )}

      {orgs?.map((o) => (
        <Card key={o.org}>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">{o.org}</CardTitle>
              <CardDescription>
                {o.agentes.length
                  ? `${o.agentes.length} agent${o.agentes.length > 1 ? "s" : ""} under power of attorney`
                  : "no agents in force"}
              </CardDescription>
            </div>
            <div className="flex gap-3 text-sm">
              <Link className="underline hover:text-seal" href={`/org/${o.org}`}>
                Manage
              </Link>
              <Link className="underline hover:text-seal" href={`/o/${o.org}`}>
                Credential
              </Link>
            </div>
          </CardHeader>

          <CardContent>
            {o.agentes.length ? (
              <ul className="divide-y divide-hairline">
                {o.agentes.map((a) => (
                  <li key={a} className="flex items-baseline justify-between gap-4 py-2">
                    <span className="font-medium">{a}</span>
                    {/* O nome pelo qual a contraparte encontra o agente. */}
                    <span className="font-mono text-xs text-slate">
                      {a}*{o.org}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate">
                No agents yet — an organization without a power of attorney in force cannot move
                value.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
