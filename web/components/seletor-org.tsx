"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { freighter, type FreighterApi } from "@/lib/carteira";

async function carregarPadrao(fundador: string): Promise<string[]> {
  const r = await fetch(`/api/minhas-orgs?fundador=${encodeURIComponent(fundador)}`);
  const b = await r.json();
  if (!r.ok) throw new Error(b?.error ?? "could not read your organizations");
  return (b.orgs ?? []).map((o: { org: string }) => o.org);
}

/**
 * Resolve *qual* organização a aba está mostrando.
 *
 * Console e credencial apontavam para uma organização fixa em variável de
 * ambiente. Quem constituía a própria via o painel de outra pessoa — e concluía,
 * com razão, que a sua não tinha sido criada.
 *
 * Com uma organização só não há escolha a fazer, e o seletor não aparece: pedir
 * um clique para confirmar o óbvio é atrito sem informação.
 */
export default function ComOrg({
  api,
  carregar = carregarPadrao,
  children,
}: {
  api?: FreighterApi;
  carregar?: (fundador: string) => Promise<string[]>;
  children: (org: string) => ReactNode;
}) {
  const [fundador, setFundador] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<string[] | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
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
        const lista = await carregar(address);
        if (!vivo) return;

        setOrgs(lista);
        // A lista já vem da mais recente para a mais antiga: quem acabou de
        // constituir quer ver o que acabou de criar.
        setEscolhida(lista[0] ?? null);
      } catch (e) {
        // "Não consegui ler" e "você não tem" são coisas diferentes.
        if (vivo) setErro(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [api, carregar]);

  if (erro) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p role="alert" className="rounded-md bg-denysoft px-3 py-2 text-sm text-deny">
          Could not read the chain: {erro}
        </p>
      </main>
    );
  }

  if (fundador === "") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="rounded-lg border border-hairline bg-surface px-5 py-8 text-center text-sm text-slate">
          Connect your wallet to see your organizations.
        </p>
      </main>
    );
  }

  if (!orgs) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-slate">loading…</p>
      </main>
    );
  }

  if (orgs.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="rounded-lg border border-hairline bg-surface px-5 py-8 text-center text-sm text-slate">
          This wallet hasn&apos;t chartered anything yet.{" "}
          <Link className="underline hover:text-seal" href="/constituir">
            Charter an organization
          </Link>
          .
        </p>
      </main>
    );
  }

  return (
    <>
      {orgs.length > 1 && (
        <div className="mx-auto max-w-5xl px-6 pt-8">
          <label className="text-sm">
            <span className="mb-1 block text-slate">Organization</span>
            <select
              value={escolhida ?? ""}
              onChange={(e) => setEscolhida(e.target.value)}
              className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
            >
              {orgs.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {escolhida && children(escolhida)}
    </>
  );
}
