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
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold">{org}</h1>
        <p className="text-sm text-neutral-600">
          Procurações vigentes, lidas da rede. Nenhuma carteira necessária.
        </p>
      </header>

      {credenciais.length === 0 ? (
        <p className="text-sm text-neutral-600">Nenhum agente encontrado nesta organização.</p>
      ) : (
        credenciais.map((c) => <CredencialAgente key={c.label} credencial={c} />)
      )}

      <footer className="border-t border-neutral-200 pt-4 text-sm text-neutral-600">
        Cada campo vem de uma leitura on-chain. Nada aqui depende de confiar em quem opera a
        organização.
      </footer>
    </main>
  );
}
