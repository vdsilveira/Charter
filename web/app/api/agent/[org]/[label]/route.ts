import { NextResponse } from "next/server";
import { ErroDeLeitura, credencialDe } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ org: string; label: string }> },
) {
  const { org, label } = await params;
  try {
    return NextResponse.json(await credencialDe(org, label));
  } catch (e) {
    // Quem consome isto é outro agente: precisa do código, não de stack trace.
    const erro = e as ErroDeLeitura;
    return NextResponse.json(
      { error: erro.message, contractError: erro.codigo ?? null, org, label },
      { status: erro.status ?? 500 },
    );
  }
}
