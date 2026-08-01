import { NextResponse } from "next/server";
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

  const registro = process.env.CHARTER_REGISTRY;
  if (!registro) {
    return NextResponse.json({ error: "registry address not configured" }, { status: 500 });
  }

  try {
    return NextResponse.json({ orgs: await buscarOrganizacoes(fundador, registro) });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
