import { NextResponse } from "next/server";
import { montarAdicaoAgente, montarRemocaoAgente } from "@/lib/write";

export const dynamic = "force-dynamic";

const semCarteira = () =>
  NextResponse.json({ error: "connect a wallet to sign as the founder" }, { status: 400 });

/** Monta a adição do agente — a carteira dele vai no corpo, a chave nunca. */
export async function POST(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  try {
    const { fundador, ...agente } = await req.json();
    if (!fundador?.trim()) return semCarteira();
    return NextResponse.json(await montarAdicaoAgente(org, agente, fundador));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}

/** Monta a remoção da procuração — da conta, não só do registro. */
export async function DELETE(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const busca = new URL(req.url).searchParams;
  const label = busca.get("label");
  const fundador = busca.get("fundador");

  if (!label) return NextResponse.json({ error: "the agent label is required" }, { status: 400 });
  if (!fundador) return semCarteira();

  try {
    return NextResponse.json(await montarRemocaoAgente(org, label, fundador));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
