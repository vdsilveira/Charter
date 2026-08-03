import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { conferirResposta, diagnosticar } from "@/lib/admin";
import { emitirKyb, estaVerificada } from "@/lib/kyb";

export const dynamic = "force-dynamic";
// Quatro transações em sequência, cada uma esperando o ledger fechar.
export const maxDuration = 300;

/**
 * Emite claim KYB para uma conta — o ato do compliance officer.
 *
 * Escreve com a chave do issuer, então o portão vem antes de qualquer leitura
 * do corpo. Falha fechada: sem resposta válida ao desafio, nada acontece.
 */
export async function POST(req: Request) {
  try {
    const { nonce, endereco, assinatura, conta } = await req.json();

    const recusa = conferirResposta({ nonce, endereco, assinatura });
    if (recusa) {
      // O tamanho da assinatura vai junto porque a extensão decide o formato, e
      // sem esse dado a investigação vira adivinhação: 64 bytes é assinatura
      // ed25519 crua; outro número aponta para envelope ou codificação
      // inesperada.
      const bytes = Buffer.from(String(assinatura ?? ""), "base64").length;
      // Fora de produção, o servidor tem a chave e pode dizer **o que** a
      // carteira assinou, em vez de deixar a próxima tentativa no chute.
      const pista = diagnosticar(nonce, assinatura);
      return NextResponse.json(
        { error: `${recusa} (signature: ${bytes} bytes${pista ? `; assinou: ${pista}` : ""})` },
        { status: 403 },
      );
    }

    if (!conta || !StrKey.isValidEd25519PublicKey(String(conta).trim())) {
      return NextResponse.json(
        { error: "Invalid account: a Stellar address starts with G and is 56 characters long." },
        { status: 400 },
      );
    }

    const alvo = String(conta).trim();
    if (await estaVerificada(alvo)) {
      // Emitir de novo criaria uma segunda identidade para a mesma conta e
      // gastaria taxa sem mudar nada.
      return NextResponse.json({ conta: alvo, verificado: true, jaEstava: true });
    }

    return NextResponse.json(await emitirKyb(alvo));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
