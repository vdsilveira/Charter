import { NextResponse } from "next/server";
import { criarDesafio } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** Um nonce para o admin assinar. Emitir é inofensivo; o que vale é a resposta. */
export async function GET() {
  return NextResponse.json({ nonce: criarDesafio() });
}
