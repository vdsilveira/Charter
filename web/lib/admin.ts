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
import { Keypair, hash } from "@stellar/stellar-sdk";
import { env } from "./env-servidor";

const VALIDADE_MS = 5 * 60_000;

/**
 * O que a carteira pode ter assinado, com nome.
 *
 * A extensão decide o que fazer com o blob, e a biblioteca só repassa — não há
 * como saber de fora. Em vez de apostar numa forma, listamos as plausíveis: o
 * portão aceita qualquer uma, e `diagnosticar` usa a mesma lista para dizer
 * **qual** foi, quando nenhuma bate.
 *
 * Aceitar várias não afrouxa nada: toda candidata é derivada deste nonce
 * específico, e produzir a assinatura de qualquer uma exige a chave.
 */
function candidatas(nonce: string): [string, Buffer][] {
  const cru = Buffer.from(nonce, "utf8");
  const b64 = Buffer.from(cru.toString("base64"), "utf8");
  const prefixado = Buffer.from(`Stellar Signed Message:\n${nonce}`, "utf8");

  return [
    ["bytes do nonce", cru],
    ["nonce em base64, como texto", b64],
    ["sha256 do nonce", hash(cru)],
    ["nonce decodificado como base64", Buffer.from(nonce, "base64")],
    ["sha256 do nonce em base64", hash(b64)],
    ["prefixo 'Stellar Signed Message'", prefixado],
    ["sha256 do prefixado", hash(prefixado)],
  ];
}

/**
 * Quando nada bate, descobre o que a carteira assinou de fato.
 *
 * Só é possível porque a chave que assina está no servidor: assinamos cada
 * candidata e comparamos. Sem isto, cada tentativa é um chute e o ciclo se
 * repete — foi o que aconteceu quatro vezes.
 *
 * Fica fora de produção: expõe detalhe interno e só serve para depurar
 * integração com carteira.
 */
export function diagnosticar(nonce: string, assinatura: string): string | null {
  if (process.env.NODE_ENV === "production") return null;

  try {
    const kp = Keypair.fromSecret(env("ADMIN_SECRET"));
    const recebida = Buffer.from(assinatura, "base64");

    for (const [nome, bytes] of candidatas(nonce)) {
      if (kp.sign(bytes).equals(recebida)) return nome;
    }
    return `nenhuma das ${candidatas(nonce).length} candidatas`;
  } catch {
    return null;
  }
}

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

/**
 * Carteira autorizada a operar a área de administração.
 *
 * **Não** é a mesma coisa que a chave que assina na cadeia. `ADMIN_SECRET` é a
 * autoridade do identity registry — foi com ela que a stack subiu
 * (`--admin admin --manager admin`), e trocá-la faria o registro recusar as
 * emissões. Já *quem pode pedir* uma emissão é uma conferência de endereço, e
 * não precisa de chave nenhuma no servidor.
 *
 * `PLATFORM_ADMIN` separa os dois: o operador conecta a carteira dele no
 * Freighter, e o servidor continua assinando com a sua. Sem a variável, cai na
 * chave do servidor — que era o comportamento anterior.
 */
export function enderecoDoAdmin(): string {
  const configurado = process.env.PLATFORM_ADMIN?.trim();
  if (configurado) return configurado;
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

    // `signMessage` entrega o blob à extensão, e é **ela** que decide o que
    // assinar e como devolver. Sem um browser para conferir, aceitamos as
    // formas plausíveis em vez de adivinhar uma.
    //
    // Isso não afrouxa o portão: toda candidata continua sendo uma assinatura
    // da chave do administrador sobre dado derivado deste nonce. Quem não tem
    // a chave não produz nenhuma delas.
    const cargas = candidatas(r.nonce).map(([, bytes]) => bytes);
    const assinaturas = [
      Buffer.from(r.assinatura, "base64"),
      // Hexadecimal só é tentado quando o texto de fato é hexadecimal; do
      // contrário `Buffer.from` devolveria lixo truncado em silêncio.
      ...(/^[0-9a-f]+$/i.test(r.assinatura) ? [Buffer.from(r.assinatura, "hex")] : []),
    ].filter((b) => b.length === 64);

    if (assinaturas.length === 0) return "malformed signature";

    const ok = assinaturas.some((sig) => cargas.some((carga) => kp.verify(carga, sig)));
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
