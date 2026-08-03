import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { pagarConfidencial, saldoConfidencial } from "@/lib/folha";

export const dynamic = "force-dynamic";
// Uma prova de conhecimento zero leva segundos de CPU.
export const maxDuration = 300;

/** Saldo do tesouro confidencial — legível só por quem tem a chave. */
export async function GET() {
  try {
    return NextResponse.json(await saldoConfidencial());
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}

/** Paga com o valor oculto na rede. */
export async function POST(req: Request) {
  try {
    const { para, valor } = await req.json();
    if (!para || !StrKey.isValidEd25519PublicKey(String(para).trim())) {
      return NextResponse.json(
        { error: "Recipient must be a Stellar address starting with G." },
        { status: 400 },
      );
    }
    return NextResponse.json(await pagarConfidencial(String(para).trim(), String(valor ?? "")));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
