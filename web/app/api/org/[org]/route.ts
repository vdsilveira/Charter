import { NextResponse } from "next/server";
import { ErroDeLeitura, orgDe } from "@/lib/chain";

export const dynamic = "force-dynamic";

/** A organização como o registro a conhece: fundador, conta e agentes atuais. */
export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  try {
    return NextResponse.json(await orgDe(org));
  } catch (e) {
    const erro = e as ErroDeLeitura;
    return NextResponse.json({ error: String(erro.message ?? e) }, { status: erro.status ?? 502 });
  }
}
