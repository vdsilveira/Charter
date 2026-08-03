import { NextResponse } from "next/server";
import { decisoes, orgDe } from "@/lib/chain";

export const dynamic = "force-dynamic";

/**
 * Operações liquidadas por uma organização.
 *
 * Sem `?org`, cai na conta corporativa do ambiente — o comportamento antigo,
 * para não quebrar quem já chamava.
 */
export async function GET(req: Request) {
  const org = new URL(req.url).searchParams.get("org");
  try {
    const conta = org ? (await orgDe(org)).account : undefined;
    return NextResponse.json({ decisions: await decisoes(conta) });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
