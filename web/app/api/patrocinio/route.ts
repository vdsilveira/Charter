import { NextResponse } from "next/server";
import { patrocinar, validarPedido } from "@/lib/patrocinio";

export const dynamic = "force-dynamic";
// Submete e espera o ledger fechar.
export const maxDuration = 120;

/**
 * O salto fora da cadeia: o agente manda a autorização assinada, aqui ela vira
 * transação paga pelo patrocinador.
 *
 * A rota não recebe contrato nem função — só organização, destinatário e valor.
 * A operação é remontada aqui. Ver `lib/patrocinio.ts` para por que isso não é
 * detalhe.
 */
export async function POST(req: Request) {
  try {
    const pedido = await req.json();

    const recusa = validarPedido(pedido);
    if (recusa) return NextResponse.json({ error: recusa }, { status: 400 });

    return NextResponse.json(await patrocinar(pedido));
  } catch (e) {
    // A recusa da política vem com código de contrato; a UI traduz.
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
