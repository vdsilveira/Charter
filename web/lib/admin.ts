/**
 * Portão da área de administração.
 *
 * A rota que emite claim KYB usa a chave do issuer, que fica no servidor. Sem
 * portão, qualquer um que descobrisse a URL poderia verificar qualquer carteira
 * — e o selo "organização verificada" perderia o sentido, junto com o argumento
 * do produto.
 *
 * ## Por que assinatura de transação, e não de mensagem
 *
 * `signMessage` foi a primeira tentativa e custou cinco rodadas. A biblioteca
 * do Freighter só repassa o blob para a extensão, e é **ela** que decide o que
 * assinar; sete formas plausíveis foram tentadas e nenhuma bateu. Sem um
 * browser para inspecionar, não havia como fechar isso por dedução.
 *
 * Assinatura de transação não tem essa ambiguidade: o que se assina é o hash da
 * transação, definido pelo protocolo. E é o mesmo caminho que a constituição, o
 * aporte e o saque já usam nesta carteira, com sucesso.
 *
 * O desenho é o do SEP-10: a transação de desafio nasce com **sequência 0**, o
 * que a torna impossível de submeter. A carteira assina uma prova de posse,
 * nunca uma ordem.
 */
import "server-only";
import {
  Account, Keypair, Networks, Operation, Transaction, TransactionBuilder,
} from "@stellar/stellar-sdk";
import { env } from "./env-servidor";

const VALIDADE_MS = 5 * 60_000;
const PASS = Networks.TESTNET;
/** Nome da entrada que carrega o nonce. Só serve para o operador reconhecer. */
const CHAVE = "charter admin auth";

/**
 * Desafios emitidos e ainda não usados.
 *
 * Vive em `globalThis` porque o Next empacota **cada rota separadamente**: um
 * módulo comum pode ser instanciado uma vez por rota, e aí o nonce criado em
 * `/api/admin/desafio` não existiria para `/api/admin/kyb`. O sintoma é cruel —
 * o portão recusa todo mundo com "desafio desconhecido", inclusive o admin.
 */
const chave = Symbol.for("charter.desafios.admin");
const global = globalThis as unknown as Record<symbol, Map<string, number>>;
const pendentes: Map<string, number> = (global[chave] ??= new Map());

/** Chave pública do administrador da plataforma. */
export function enderecoDoAdmin(): string {
  const configurado = process.env.PLATFORM_ADMIN?.trim();
  if (configurado) return configurado;
  return Keypair.fromSecret(env("ADMIN_SECRET")).publicKey();
}

/**
 * Monta a transação que prova posse da chave.
 *
 * A fonte é a própria carteira desafiada, com sequência 0: a rede nunca
 * aceitaria isso, e é justamente essa a garantia de que assinar aqui não
 * autoriza nada.
 */
export function criarDesafio(
  endereco: string = enderecoDoAdmin(),
  agora = Date.now(),
  aleatorio = () => Math.random(),
): { xdr: string; nonce: string } {
  // Limpeza oportunista: sem isto o mapa cresceria com desafios abandonados.
  for (const [n, prazo] of pendentes) if (prazo < agora) pendentes.delete(n);

  const nonce = `${agora}-${aleatorio().toString(36).slice(2, 12)}`;
  pendentes.set(nonce, agora + VALIDADE_MS);

  const tx = new TransactionBuilder(new Account(endereco, "-1"), {
    fee: "100",
    networkPassphrase: PASS,
  })
    .addOperation(Operation.manageData({ name: CHAVE, value: nonce }))
    .setTimeout(300)
    .build();

  return { xdr: tx.toXDR(), nonce };
}

export interface Resposta {
  /** A transação de desafio, assinada pela carteira. */
  xdr: string;
}

/**
 * Confere a resposta. Devolve o motivo da recusa, ou `null` se passou.
 *
 * O nonce é consumido em qualquer desfecho: reapresentar uma transação
 * capturada não pode funcionar.
 */
export function conferirResposta(r: Resposta, agora = Date.now()): string | null {
  let tx: Transaction;
  try {
    tx = TransactionBuilder.fromXDR(r.xdr, PASS) as Transaction;
  } catch {
    return "malformed challenge transaction";
  }

  const op = tx.operations[0];
  const nonce =
    op?.type === "manageData" && op.name === CHAVE ? op.value?.toString("utf8") : undefined;
  if (!nonce) return "this is not a challenge transaction";

  const prazo = pendentes.get(nonce);
  pendentes.delete(nonce);
  if (prazo === undefined) return "unknown or already used challenge";
  if (prazo < agora) return "challenge expired";

  // Antes de olhar a assinatura: só uma carteira interessa aqui.
  if (tx.source !== enderecoDoAdmin()) {
    return "this wallet is not the platform administrator";
  }

  try {
    const kp = Keypair.fromPublicKey(tx.source);
    const digest = tx.hash();
    const ok = tx.signatures.some((s) => kp.verify(digest, s.signature()));
    return ok ? null : "signature does not match the challenge";
  } catch {
    return "malformed signature";
  }
}

/** Só para teste: esvazia os desafios pendentes entre casos. */
export function limparDesafios() {
  pendentes.clear();
}
