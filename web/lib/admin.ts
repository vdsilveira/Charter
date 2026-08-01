/**
 * Portão da área de administração.
 *
 * A rota que emite claim KYB usa a chave do issuer, que fica no servidor. Sem
 * portão, qualquer um que descobrisse a URL poderia verificar qualquer carteira
 * — e o selo "organização verificada" perderia todo o sentido, junto com o
 * argumento do produto.
 *
 * Endereço declarado não prova nada: o cliente manda o que quiser. Por isso o
 * fluxo é desafio e resposta — o servidor emite um nonce, a carteira assina, e
 * o servidor confere a assinatura contra a chave do admin.
 *
 * Falha fechada: qualquer dúvida recusa. Um portão que erra para o lado de
 * deixar entrar não é portão.
 */
import "server-only";
import { Keypair } from "@stellar/stellar-sdk";
import { env } from "./env-servidor";

const VALIDADE_MS = 5 * 60_000;

/**
 * Desafios emitidos e ainda não usados.
 *
 * Vive em `globalThis` porque o Next empacota **cada rota separadamente**: um
 * módulo comum pode ser instanciado uma vez por rota, e aí o nonce criado em
 * `/api/admin/desafio` não existiria para `/api/admin/kyb`. O sintoma é cruel —
 * o portão recusa todo mundo com "desafio desconhecido", inclusive o admin, e
 * parece problema de assinatura.
 *
 * Memória basta: expiram em minutos. Um reinício do servidor invalida os
 * pendentes, o que só custa um clique a mais.
 */
const chave = Symbol.for("charter.desafios.admin");
const global = globalThis as unknown as Record<symbol, Map<string, number>>;
const pendentes: Map<string, number> = (global[chave] ??= new Map());

export function criarDesafio(agora = Date.now(), aleatorio = () => Math.random()): string {
  // Limpeza oportunista: sem isto, o mapa cresceria com desafios abandonados.
  for (const [nonce, prazo] of pendentes) if (prazo < agora) pendentes.delete(nonce);

  const nonce = `charter-admin-${agora}-${aleatorio().toString(36).slice(2, 12)}`;
  pendentes.set(nonce, agora + VALIDADE_MS);
  return nonce;
}

export interface Resposta {
  nonce: string;
  endereco: string;
  /** Assinatura do nonce, em base64. */
  assinatura: string;
}

/** Chave pública do administrador da plataforma — dona da stack de identidade. */
export function enderecoDoAdmin(): string {
  return Keypair.fromSecret(env("ADMIN_SECRET")).publicKey();
}

/**
 * Confere a resposta ao desafio. Devolve o motivo da recusa, ou `null` se passou.
 *
 * O nonce é consumido em qualquer desfecho: reapresentar uma assinatura
 * capturada não pode funcionar.
 */
export function conferirResposta(r: Resposta, agora = Date.now()): string | null {
  const prazo = pendentes.get(r.nonce);
  pendentes.delete(r.nonce);

  if (prazo === undefined) return "unknown or already used challenge";
  if (prazo < agora) return "challenge expired";

  // Antes de olhar a assinatura: só uma carteira interessa aqui.
  if (r.endereco !== enderecoDoAdmin()) return "this wallet is not the platform administrator";

  try {
    const kp = Keypair.fromPublicKey(r.endereco);
    const ok = kp.verify(Buffer.from(r.nonce, "utf8"), Buffer.from(r.assinatura, "base64"));
    return ok ? null : "signature does not match the challenge";
  } catch {
    // Assinatura malformada é recusa, nunca exceção que vaze para a resposta.
    return "malformed signature";
  }
}

/** Só para teste: esvazia os desafios pendentes entre casos. */
export function limparDesafios() {
  pendentes.clear();
}
