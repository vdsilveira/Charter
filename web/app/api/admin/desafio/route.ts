import { NextResponse } from "next/server";
import { criarDesafio } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * A transação de desafio, para a carteira assinar.
 *
 * Nasce com sequência 0 — a rede nunca a aceitaria, e é isso que garante que
 * assinar aqui prova posse da chave sem autorizar coisa alguma.
 */
export async function GET() {
  return NextResponse.json({ xdr: criarDesafio().xdr });
}
