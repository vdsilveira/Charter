import CredencialAgente from "@/components/credencial-agente";
import { credencialDe } from "@/lib/chain";

export const dynamic = "force-dynamic";

/**
 * Página pública da organização.
 *
 * Renderizada no servidor e sem nenhuma carteira: é para a contraparte, que
 * ainda não é cliente. Se exigisse conexão, devolveria o problema que o produto
 * resolve — confiar em quem opera a organização.
 */
export default async function PaginaOrg({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ agents?: string }>;
}) {
  const { org } = await params;
  const { agents } = await searchParams;
  const labels = (agents ?? "trader,auditor").split(",").map((s) => s.trim());

  const credenciais = [];
  for (const label of labels) {
    try {
      credenciais.push(await credencialDe(org, label));
    } catch {
      /* agente inexistente simplesmente não vira card */
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <header>
        <p className="rotulo">public credential</p>
        <h1 className="font-serif text-3xl">{org}</h1>
        <p className="mt-1 text-sm text-slate">
          Powers of attorney in force, read from the network. No wallet required.
        </p>
      </header>

      {credenciais.length === 0 ? (
        <p className="rounded-lg border border-hairline bg-surface px-5 py-8 text-center text-sm text-slate">
          No agents found in this organization.
        </p>
      ) : (
        credenciais.map((c) => <CredencialAgente key={c.label} credencial={c} />)
      )}

      <footer className="border-t border-hairline pt-4 text-sm text-slate">
        Every field comes from an on-chain read. Nothing here depends on trusting whoever runs
        the organization.
      </footer>
    </main>
  );
}
