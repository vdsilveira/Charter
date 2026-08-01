import { NextResponse } from "next/server";
import { enviarAssinada } from "@/lib/write";

export const dynamic = "force-dynamic";

/**
 * Envia à rede o que a carteira assinou.
 *
 * Único caminho de escrita que aceita conteúdo do browser — e o mais seguro
 * deles: qualquer alteração no XDR invalidaria a assinatura, então o servidor
 * só pode encaminhar ou falhar. Ele não tem como trocar destinatário, valor ou
 * fundador pelo caminho.
 */
export async function POST(req: Request) {
  try {
    const { xdr } = await req.json();
    if (!xdr?.trim()) {
      return NextResponse.json({ error: "no signed transaction received" }, { status: 400 });
    }
    return NextResponse.json(await enviarAssinada(xdr));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
