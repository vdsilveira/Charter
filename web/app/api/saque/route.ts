import { NextResponse } from "next/server";
import { montarSaque } from "@/lib/write";

export const dynamic = "force-dynamic";

/** Monta o saque do tesouro para o fundador assinar. */
export async function POST(req: Request) {
  try {
    const { org, para, valor, fundador } = await req.json();
    if (!org?.trim()) {
      return NextResponse.json({ error: "organization is required" }, { status: 400 });
    }
    if (!fundador?.trim()) {
      return NextResponse.json({ error: "connect a wallet to sign as the founder" }, { status: 400 });
    }
    return NextResponse.json(await montarSaque({ org, para, valor, fundador }));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
