import { NextResponse } from "next/server";
import { montarLimiteAgente } from "@/lib/write";

export const dynamic = "force-dynamic";

/** Monta a alteração de teto para o fundador assinar. */
export async function POST(req: Request) {
  try {
    const { org, label, teto, fundador } = await req.json();
    if (!org?.trim() || !label?.trim()) {
      return NextResponse.json({ error: "organization and agent are required" }, { status: 400 });
    }
    if (!fundador?.trim()) {
      return NextResponse.json({ error: "connect a wallet to sign as the founder" }, { status: 400 });
    }
    return NextResponse.json(await montarLimiteAgente({ org, label, teto: teto ?? null, fundador }));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
