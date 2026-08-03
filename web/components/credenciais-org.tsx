"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CredencialAgente, { type Credencial } from "@/components/credencial-agente";
import Conduta from "@/components/conduta";

/**
 * As credenciais dos agentes de uma organização, como a contraparte as lê.
 *
 * Os rótulos vêm de `org_of`: o registro sabe quem são os agentes, e o padrão
 * fixo que existia no código escondia qualquer um com nome próprio.
 */
export default function CredenciaisDaOrg({ org }: { org: string }) {
  const [credenciais, setCredenciais] = useState<Credencial[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const info = await fetch(`/api/org/${org}`);
        const dados = await info.json();
        if (!info.ok) throw new Error(dados?.error ?? "could not read the organization");

        const lidas = await Promise.all(
          (dados.agents ?? []).map(async (label: string) => {
            const r = await fetch(`/api/agent/${org}/${label}`);
            return r.ok ? ((await r.json()) as Credencial) : null;
          }),
        );
        if (vivo) setCredenciais(lidas.filter(Boolean) as Credencial[]);
      } catch (e) {
        if (vivo) setErro(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [org]);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <header>
        <p className="rotulo">public credential</p>
        <h1 className="font-serif text-3xl">{org}</h1>
        <p className="mt-1 text-sm text-slate">
          What a counterparty reads before dealing.{" "}
          <Link className="underline hover:text-seal" href={`/o/${org}`}>
            Open the public page
          </Link>{" "}
          — it needs no wallet.
        </p>
      </header>

      {erro && (
        <p role="alert" className="rounded-md bg-denysoft px-3 py-2 text-sm text-deny">
          Could not read the chain: {erro}
        </p>
      )}

      {!credenciais && !erro && <p className="text-sm text-slate">loading…</p>}

      {credenciais?.length === 0 && (
        <p className="rounded-lg border border-hairline bg-surface px-5 py-8 text-center text-sm text-slate">
          No agents in force — an organization without a power of attorney cannot move value.
        </p>
      )}

      {/* A conduta vem antes das credenciais: quem abre esta página quer, em
          primeiro lugar, saber se dá para negociar — e é a proporção atestada
          que responde isso. */}
      {credenciais && credenciais.length > 0 && (
        <Conduta agentes={credenciais.map((c) => ({ label: c.label, conduct: c.conduct }))} />
      )}

      {credenciais?.map((c) => <CredencialAgente key={c.label} credencial={c} />)}
    </main>
  );
}
