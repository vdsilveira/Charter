/**
 * Operações que **escrevem** na cadeia.
 *
 * Rodam só no servidor. As chaves ficam em variáveis de ambiente porque, na
 * demo, o fundador não assina no browser — a alternativa correta em produção é
 * o Freighter assinando a constituição e o agente rodando com a própria chave
 * de sessão, mas isso não muda nada do que a rede verifica. O que a política
 * decide é idêntico nos dois casos.
 */
import "server-only";
import {
  Address, Keypair, Networks, Operation, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr,
} from "@stellar/stellar-sdk";
import { createCharterSigner } from "./charter-signer";
import { env } from "./env-servidor";

const RPC = process.env.STELLAR_RPC ?? "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const server = new rpc.Server(RPC);

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const entry = (k: string, v: xdr.ScVal) => new xdr.ScMapEntry({ key: sym(k), val: v });
const i128 = (v: bigint | string) => nativeToScVal(BigInt(v), { type: "i128" });
const addr = (a: string) => new Address(a).toScVal();

/** Submete o que já está assinado e espera o ledger fechar. */
async function submeter(tx: Parameters<typeof server.sendTransaction>[0]) {
  const enviada = await server.sendTransaction(tx);
  if (enviada.status === "ERROR") {
    throw new Error(JSON.stringify(enviada.errorResult ?? enviada));
  }

  let res = await server.getTransaction(enviada.hash);
  for (let i = 0; i < 40 && res.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await server.getTransaction(enviada.hash);
  }
  if (res.status !== "SUCCESS") throw new Error(`transação ${enviada.hash}: ${res.status}`);
  return { hash: enviada.hash, res };
}

async function enviar(tx: ReturnType<TransactionBuilder["build"]>, assinante: Keypair) {
  const preparada = await server.prepareTransaction(tx);
  preparada.sign(assinante);
  return submeter(preparada);
}

/**
 * Monta e prepara uma transação **para o fundador assinar na carteira**.
 *
 * A conta dele é a fonte: é de lá que sai a taxa, e é o endereço que fica
 * gravado como fundador da organização. `prepareTransaction` já roda a
 * simulação, então uma operação que a rede recusaria falha aqui — antes de a
 * carteira abrir. Pedir assinatura para algo destinado a reverter gasta a
 * confiança do usuário e uma transação.
 */
async function prepararParaAssinatura(fundador: string, operacao: xdr.Operation) {
  const fonte = await server.getAccount(fundador);
  const tx = new TransactionBuilder(fonte, { fee: "5000000", networkPassphrase: PASS })
    .addOperation(operacao)
    // Cinco minutos: entre montar e assinar existe uma pessoa lendo um pop-up.
    .setTimeout(300)
    .build();

  const preparada = await server.prepareTransaction(tx);
  return { xdr: preparada.toXDR() };
}

/**
 * Envia o que a carteira assinou.
 *
 * Só isto vem do browser: a transação é remontada a partir do XDR e submetida
 * como está. O servidor não tem como alterá-la sem invalidar a assinatura, que
 * é exatamente a propriedade que faz este caminho valer a pena.
 */
export async function enviarAssinada(xdrAssinado: string) {
  const tx = TransactionBuilder.fromXDR(xdrAssinado, PASS);
  const { hash, res } = await submeter(tx);
  return {
    hash,
    retorno: res.returnValue ? String(scValToNative(res.returnValue)) : null,
  };
}

// ---------------------------------------------------------------------------
// Pagamento do agente
// ---------------------------------------------------------------------------

interface Pagamento {
  destinatario: string;
  valor: string;
}

/** Monta a operação e assina a auth entry do agente. */
async function prepararPagamento({ destinatario, valor }: Pagamento) {
  const orgAccount = env("CHARTER_ORG_ACCOUNT");
  const alvo = env("CHARTER_TARGET");
  const admin = Keypair.fromSecret(env("ADMIN_SECRET"));

  const signer = createCharterSigner({
    account: orgAccount,
    agentSecret: env("AGENT_TRADER_SECRET"),
    verifier: env("CHARTER_ED25519_VERIFIER"),
    contextRuleId: Number(process.env.CHARTER_CONTEXT_RULE_ID ?? 0),
    networkPassphrase: PASS,
    rpc: server,
  });

  const op = (auth?: xdr.SorobanAuthorizationEntry[]) =>
    Operation.invokeContractFunction({
      contract: alvo,
      function: "transfer",
      args: [addr(orgAccount), addr(destinatario), i128(valor)],
      ...(auth ? { auth } : {}),
    });

  const fonte = await server.getAccount(admin.publicKey());
  const sonda = new TransactionBuilder(fonte, { fee: "3000000", networkPassphrase: PASS })
    .addOperation(op())
    .setTimeout(60)
    .build();

  const primeira = await server.simulateTransaction(sonda);
  if (rpc.Api.isSimulationError(primeira)) {
    // Falha já aqui significa problema anterior à política: saldo, conta
    // inexistente, contrato errado.
    return { erroPrevio: primeira.error };
  }

  const ultimo = (await server.getLatestLedger()).sequence;
  const assinadas: xdr.SorobanAuthorizationEntry[] = [];
  for (const e of primeira.result?.auth ?? []) {
    const { signedAuthEntry } = await signer.signAuthEntry(e.toXDR("base64"), {
      validUntilLedgerSeq: ultimo + 60,
    });
    assinadas.push(xdr.SorobanAuthorizationEntry.fromXDR(signedAuthEntry, "base64"));
  }

  const comAuth = new TransactionBuilder(await server.getAccount(admin.publicKey()), {
    fee: "3000000",
    networkPassphrase: PASS,
  })
    .addOperation(op(assinadas))
    .setTimeout(60)
    .build();

  return { tx: comAuth, admin };
}

/**
 * Prevê se a rede aceitaria o pagamento — **sem enviar transação**.
 *
 * A simulação só executa `__check_auth` quando as auth entries estão
 * assinadas; sem isso a policy nunca roda e a previsão seria falsamente
 * otimista. Por isso o caminho aqui é o mesmo do envio, menos o último passo.
 */
export async function simularPagamento(p: Pagamento) {
  const preparo = await prepararPagamento(p);
  if ("erroPrevio" in preparo) return { wouldSucceed: false, error: preparo.erroPrevio };

  const previsao = await server.simulateTransaction(preparo.tx!);
  if (rpc.Api.isSimulationError(previsao)) {
    return { wouldSucceed: false, error: previsao.error };
  }
  return { wouldSucceed: true };
}

export async function enviarPagamento(p: Pagamento) {
  const preparo = await prepararPagamento(p);
  if ("erroPrevio" in preparo) throw new Error(preparo.erroPrevio);

  const { hash } = await enviar(preparo.tx!, preparo.admin!);
  return { hash };
}

// ---------------------------------------------------------------------------
// Constituição da organização
// ---------------------------------------------------------------------------

export interface AgenteEntrada {
  label: string;
  /** Carteira do agente: é para ela que a procuração é escrita. */
  carteira: string;
  allowedFns: string[];
  kybThreshold: string;
}

/** `GateParams` — chaves em ordem alfabética, como todo struct em Soroban. */
function gateParams(a: AgenteEntrada, identityVerifier: string, claimTopic: number) {
  return xdr.ScVal.scvMap([
    entry("agent_label", sym(a.label)),
    entry("allowed_fns", xdr.ScVal.scvVec(a.allowedFns.map(sym))),
    entry("claim_topic", xdr.ScVal.scvU32(claimTopic)),
    entry("identity_registry", addr(identityVerifier)),
    entry("kyb_threshold", i128(a.kybThreshold || "0")),
  ]);
}

/**
 * `AgentRule { label, policies, signers, target, valid_until }`
 *
 * O signatário é `External(verificador ed25519, chave pública do agente)`, e a
 * chave pública sai do próprio endereço `G…` — não há nada a mais para o
 * administrador informar, e a organização segue guardando a permissão, nunca o
 * segredo.
 *
 * **Não** é `Delegated(carteira)`, que parece o caminho natural. O
 * `authenticate` da OpenZeppelin responde a um signer delegado com
 * `require_auth_for_args` no endereço dele, dentro do `__check_auth` — auth
 * fora da raiz, que a simulação não grava e o modo `enforce` recusa. Um agente
 * assim nasceria com procuração válida e sem conseguir assinar nada, que é
 * exatamente o defeito anterior (chaves geradas no servidor e descartadas) com
 * outra causa.
 *
 * Com `External`, o agente assina o auth digest com a própria chave e o
 * verificador confere — é o que `charter-signer` faz, e o caminho que a rede
 * aceita hoje.
 */
function agentRule(a: AgenteEntrada, cfg: {
  gate: string;
  target: string;
  identityVerifier: string;
  claimTopic: number;
  verifier: string;
}) {
  return xdr.ScVal.scvMap([
    entry("label", xdr.ScVal.scvString(a.label)),
    entry(
      "policies",
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: addr(cfg.gate),
          val: gateParams(a, cfg.identityVerifier, cfg.claimTopic),
        }),
      ]),
    ),
    entry(
      "signers",
      xdr.ScVal.scvVec([
        xdr.ScVal.scvVec([
          sym("External"),
          addr(cfg.verifier),
          xdr.ScVal.scvBytes(StrKey.decodeEd25519PublicKey(a.carteira)),
        ]),
      ]),
    ),
    entry("target", addr(cfg.target)),
    entry("valid_until", xdr.ScVal.scvVoid()),
  ]);
}

/** Endereço malformado vira erro claro aqui, não transação recusada depois. */
function exigirCarteira(a: AgenteEntrada) {
  if (!a.carteira?.trim()) {
    throw new Error(`Agent "${a.label}" needs a wallet — the power of attorney is written to it.`);
  }
  if (!StrKey.isValidEd25519PublicKey(a.carteira.trim())) {
    throw new Error(
      `Invalid wallet for agent "${a.label}": a Stellar address starts with G and is 56 characters long.`,
    );
  }
}

/**
 * Monta a constituição para o **fundador** assinar.
 *
 * Uma transação cria a conta corporativa, uma procuração por agente e o
 * registro dos rótulos. A taxa sai da conta de quem assina, no mesmo bloco —
 * não há como constituir sem pagar nem pagar sem constituir.
 */
export async function montarConstituicao({
  fundador,
  org,
  agentes,
}: {
  fundador: string;
  org: string;
  agentes: AgenteEntrada[];
}) {
  agentes.forEach(exigirCarteira);

  const gate = env("CHARTER_GATE");
  const cfg = {
    gate,
    target: env("CHARTER_TARGET"),
    identityVerifier: env("CHARTER_IDENTITY_VERIFIER"),
    claimTopic: Number(process.env.CHARTER_CLAIM_TOPIC ?? 1),
    verifier: env("CHARTER_ED25519_VERIFIER"),
  };

  return prepararParaAssinatura(
    fundador,
    Operation.invokeContractFunction({
      contract: env("CHARTER_REGISTRY"),
      function: "create_org",
      args: [
        sym(org),
        addr(fundador),
        addr(gate),
        xdr.ScVal.scvVec(agentes.map((a) => agentRule(a, cfg))),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// Gestão de agentes
// ---------------------------------------------------------------------------

/**
 * Monta a adição de um agente para o fundador assinar.
 *
 * A autorização atravessa duas camadas: o registro exige o fundador, e a conta
 * corporativa exige a regra do administrador (`Signer::Delegated` para o mesmo
 * endereço). Ambas se resolvem com a assinatura de quem é fundador de fato —
 * quem não for é recusado já na simulação, com 5004.
 */
export async function montarAdicaoAgente(org: string, a: AgenteEntrada, fundador: string) {
  exigirCarteira(a);

  const regra = agentRule(a, {
    gate: env("CHARTER_GATE"),
    target: env("CHARTER_TARGET"),
    identityVerifier: env("CHARTER_IDENTITY_VERIFIER"),
    claimTopic: Number(process.env.CHARTER_CLAIM_TOPIC ?? 1),
    verifier: env("CHARTER_ED25519_VERIFIER"),
  });

  return prepararParaAssinatura(
    fundador,
    Operation.invokeContractFunction({
      contract: env("CHARTER_REGISTRY"),
      function: "add_agent",
      args: [sym(org), regra],
    }),
  );
}

export async function montarRemocaoAgente(org: string, label: string, fundador: string) {
  return prepararParaAssinatura(
    fundador,
    Operation.invokeContractFunction({
      contract: env("CHARTER_REGISTRY"),
      function: "remove_agent",
      args: [sym(org), sym(label)],
    }),
  );
}
