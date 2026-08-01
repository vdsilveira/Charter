import { NextResponse } from "next/server";
import { env } from "@/lib/env-servidor";
import { orgDe } from "@/lib/chain";
import { buscarOrganizacoes } from "@/lib/minhas-orgs";

export const dynamic = "force-dynamic";

/**
 * As organizações de uma carteira.
 *
 * Leitura pura: recebe o endereço na query e não guarda nada. Qualquer um pode
 * consultar qualquer carteira — o que se lê aqui já está público no ledger, e
 * fingir o contrário seria privacidade de fachada.
 */
export async function GET(req: Request) {
  const fundador = new URL(req.url).searchParams.get("fundador");
  if (!fundador) {
    return NextResponse.json({ error: "connect a wallet first" }, { status: 400 });
  }

  try {
    const encontradas = await buscarOrganizacoes(fundador, env("CHARTER_REGISTRY"));

    // O histórico diz *quais* organizações são desta carteira — o registro não
    // indexa por fundador. Quem está em vigor **agora** só o registro sabe, e é
    // dele que vem a lista de agentes: o histórico mostraria quem havia na
    // constituição, mesmo que já removido.
    const orgs = await Promise.all(
      encontradas.map(async (o) => {
        try {
          return { ...o, agentes: (await orgDe(o.org)).agents };
        } catch {
          // Organização ilegível não some da lista: o nome ainda é útil.
          return o;
        }
      }),
    );

    return NextResponse.json({ orgs });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
