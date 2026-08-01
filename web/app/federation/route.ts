import { NextResponse } from "next/server";
import { credencialDe } from "@/lib/chain";
import { resolverFederation } from "@/lib/federation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dominio = process.env.CHARTER_DOMAIN ?? url.host;

  const r = await resolverFederation(
    { q: url.searchParams.get("q"), type: url.searchParams.get("type") },
    {
      dominio,
      org: process.env.CHARTER_ORG ?? "alphafund",
      // Resolve pela credencial: um agente removido deixa de resolver, porque
      // `credentials_of` marca inativo e o endereço obsoleto não deve circular.
      resolve: async (org, label) => {
        try {
          const c = await credencialDe(org, label);
          return c.active ? c.account : null;
        } catch {
          return null;
        }
      },
    },
  );

  return NextResponse.json(r.body, {
    status: r.status,
    headers: { "access-control-allow-origin": "*" },
  });
}
