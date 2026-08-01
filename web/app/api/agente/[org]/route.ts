import { NextResponse } from "next/server";
import { adicionarAgente, removerAgente } from "@/lib/write";

export const dynamic = "force-dynamic";

/** Adiciona agente indicando a carteira dele. */
export async function POST(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  try {
    return NextResponse.json(await adicionarAgente(org, await req.json()));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}

/** Remove a procuração — da conta, não só do registro. */
export async function DELETE(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const label = new URL(req.url).searchParams.get("label");
  if (!label) return NextResponse.json({ error: "informe o rótulo" }, { status: 400 });
  try {
    return NextResponse.json(await removerAgente(org, label));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
