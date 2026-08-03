/**
 * Patrocínio de taxa: o agente assina, o fundador paga.
 *
 * O agente carrega a chave que **autoriza** a operação — e nada além disso.
 * Não precisa de XLM, não precisa de conta financiada, não precisa nem existir
 * na rede. Quem paga a taxa é o patrocinador, que por sua vez não tem poder
 * nenhum sobre o tesouro: a conta corporativa só se move mediante a assinatura
 * do agente, dentro da procuração dele.
 *
 * Separar as duas coisas é o ponto do desenho. Um agente comprometido não drena
 * mais do que sua procuração permite; um patrocinador comprometido não move
 * valor nenhum, só desperdiça a própria taxa.
 *
 * ## O que este módulo recusa a fazer
 *
 * O patrocinador **remonta a operação** a partir de campos tipados — organização,
 * destinatário, valor — e nunca executa calldata recebida. Um patrocinador que
 * assina o que mandarem é uma torneira de taxa e, pior, um oráculo de execução
 * para qualquer contrato. Se a operação remontada não for idêntica à que o
 * agente assinou, a autorização falha on-chain; não há como enganar os dois
 * lados ao mesmo tempo.
 */
import "server-only";
import {
  Address, Keypair, Networks, Operation, StrKey, TransactionBuilder, nativeToScVal, rpc, xdr,
} from "@stellar/stellar-sdk";
import { env } from "./env-servidor";
import { orgDe } from "./chain";

const server = new rpc.Server(process.env.STELLAR_RPC ?? "https://soroban-testnet.stellar.org");
const PASS = Networks.TESTNET;

export interface Pedido {
  org: string;
  destinatario: string;
  /** Em stroops, inteiro. */
  valor: string;
  /** Auth entries assinadas pelo agente, em base64. */
  entradas: string[];
}

/** Devolve o motivo da recusa, ou `null` se o pedido está bem formado. */
export function validarPedido(p: Partial<Pedido>): string | null {
  if (!p?.org?.trim()) return "organization is required";

  if (!p.destinatario || !StrKey.isValidEd25519PublicKey(p.destinatario.trim())) {
    return "recipient must be a Stellar address starting with G";
  }

  // i128 não tem casas decimais: aceitar "1.5" viraria erro de conversão três
  // camadas adiante, longe da causa.
  if (!p.valor || !/^\d+$/.test(p.valor.trim()) || BigInt(p.valor) <= 0n) {
    return "amount must be a positive integer in stroops";
  }

  if (!Array.isArray(p.entradas) || p.entradas.length === 0) {
    return "no signed authorization from the agent";
  }

  return null;
}

/**
 * Monta a invocação que o agente vai autorizar.
 *
 * Exportada porque o **agente** usa a mesma função: se os dois lados montassem
 * a operação de jeitos diferentes, a assinatura não fecharia e o erro apareceria
 * como falha de autorização, sem dizer que a causa foi divergência de montagem.
 */
export function operacaoDePagamento({
  contaOrg,
  destinatario,
  valor,
  alvo,
  auth,
}: {
  contaOrg: string;
  destinatario: string;
  valor: string;
  alvo: string;
  auth?: xdr.SorobanAuthorizationEntry[];
}) {
  return Operation.invokeContractFunction({
    contract: alvo,
    function: "transfer",
    args: [
      new Address(contaOrg).toScVal(),
      new Address(destinatario).toScVal(),
      nativeToScVal(BigInt(valor), { type: "i128" }),
    ],
    ...(auth ? { auth } : {}),
  });
}

export interface Patrocinio {
  hash: string;
  patrocinador: string;
  contaOrg: string;
}

/**
 * Submete a transação pagando a taxa.
 *
 * A conta do patrocinador é a **fonte** — é dela que sai o fee. A conta
 * corporativa aparece só como `from` da transferência, e quem a autoriza é a
 * assinatura que veio do agente.
 */
export async function patrocinar(p: Pedido): Promise<Patrocinio> {
  const recusa = validarPedido(p);
  if (recusa) throw new Error(recusa);

  const patrocinador = Keypair.fromSecret(env("SPONSOR_SECRET"));
  const { account: contaOrg } = await orgDe(p.org.trim());

  const auth = p.entradas.map((e) => xdr.SorobanAuthorizationEntry.fromXDR(e, "base64"));
  const op = operacaoDePagamento({
    contaOrg,
    destinatario: p.destinatario.trim(),
    valor: p.valor.trim(),
    alvo: env("CHARTER_TARGET"),
    auth,
  });

  const tx = new TransactionBuilder(await server.getAccount(patrocinador.publicKey()), {
    fee: "5000000",
    networkPassphrase: PASS,
  })
    .addOperation(op)
    .setTimeout(120)
    .build();

  // `prepareTransaction` calcula recursos e taxa; as auth entries assinadas
  // seguem intactas, porque assemble não as recria quando já existem.
  const preparada = await server.prepareTransaction(tx);
  preparada.sign(patrocinador);

  const enviada = await server.sendTransaction(preparada);
  if (enviada.status === "ERROR") {
    throw new Error(JSON.stringify(enviada.errorResult ?? enviada));
  }

  let res = await server.getTransaction(enviada.hash);
  for (let i = 0; i < 40 && res.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await server.getTransaction(enviada.hash);
  }
  if (res.status !== "SUCCESS") {
    // A recusa da política chega aqui: a transação é submetida, executada e
    // revertida pela rede. É o comportamento que o produto promete mostrar.
    throw new Error(`transaction ${enviada.hash}: ${res.status}`);
  }

  return { hash: enviada.hash, patrocinador: patrocinador.publicKey(), contaOrg };
}
