import { NextResponse } from "next/server";
import { simularPagamento } from "@/lib/write";

export const dynamic = "force-dynamic";

/** Previsão de recusa — nunca envia transação. */
export async function POST(req: Request) {
  try {
    return NextResponse.json(await simularPagamento(await req.json()));
  } catch (e) {
    return NextResponse.json(
      { wouldSucceed: false, error: String((e as Error).message ?? e) },
      { status: 200 }, // a falha da previsão é o resultado, não um erro de API
    );
  }
}
