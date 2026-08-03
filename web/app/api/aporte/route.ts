import { NextResponse } from "next/server";
import { montarAporte } from "@/lib/write";
import { saldoDaOrg } from "@/lib/chain";

export const dynamic = "force-dynamic";

/** Saldo atual da conta corporativa. */
export async function GET(req: Request) {
  const org = new URL(req.url).searchParams.get("org");
  if (!org) return NextResponse.json({ error: "organization is required" }, { status: 400 });

  try {
    return NextResponse.json({ org, saldo: await saldoDaOrg(org) });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}

/** Monta o aporte para a carteira assinar. O servidor não move dinheiro. */
export async function POST(req: Request) {
  try {
    const { org, de, valor } = await req.json();
    if (!org?.trim()) return NextResponse.json({ error: "organization is required" }, { status: 400 });
    if (!de?.trim()) return NextResponse.json({ error: "connect a wallet to fund" }, { status: 400 });

    return NextResponse.json(await montarAporte({ org, de, valor }));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
