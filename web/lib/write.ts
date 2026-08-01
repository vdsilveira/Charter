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
  Address, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr,
} from "@stellar/stellar-sdk";
import { createCharterSigner } from "./charter-signer";

const RPC = process.env.STELLAR_RPC ?? "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const server = new rpc.Server(RPC);

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`variável de ambiente ausente: ${k}`);
  return v;
};

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const entry = (k: string, v: xdr.ScVal) => new xdr.ScMapEntry({ key: sym(k), val: v });
const i128 = (v: bigint | string) => nativeToScVal(BigInt(v), { type: "i128" });
const addr = (a: string) => new Address(a).toScVal();

async function enviar(tx: ReturnType<TransactionBuilder["build"]>, assinante: Keypair) {
  const preparada = await server.prepareTransaction(tx);
  preparada.sign(assinante);
  const enviada = await server.sendTransaction(preparada);
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

/** `AgentRule { label, policies, signers, target, valid_until }` */
function agentRule(a: AgenteEntrada, pubkey: Buffer | null, cfg: {
  gate: string;
  verifier: string;
  target: string;
  identityVerifier: string;
  claimTopic: number;
  /** Carteira do agente. Quando presente, o signatário é ela, via Delegated. */
  delegado?: string;
}) {
  // `Delegated` faz a conta delegar a verificação ao endereço do agente: ele
  // assina com a própria carteira, sem verifier externo no caminho.
  const signer = cfg.delegado
    ? xdr.ScVal.scvVec([sym("Delegated"), addr(cfg.delegado)])
    : xdr.ScVal.scvVec([sym("External"), addr(cfg.verifier), xdr.ScVal.scvBytes(pubkey!)]);
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
    entry("signers", xdr.ScVal.scvVec([signer])),
    entry("target", addr(cfg.target)),
    entry("valid_until", xdr.ScVal.scvVoid()),
  ]);
}

/**
 * Constitui a organização em **uma** transação: conta corporativa, uma
 * procuração por agente e o registro dos rótulos.
 *
 * As chaves dos agentes são geradas aqui e devolvidas: quem constitui precisa
 * delas para operar depois, e elas não existem antes deste momento.
 */
export async function constituirOrg({
  org,
  agentes,
}: {
  org: string;
  agentes: AgenteEntrada[];
}) {
  const admin = Keypair.fromSecret(env("ADMIN_SECRET"));
  const registry = env("CHARTER_REGISTRY");
  const gate = env("CHARTER_GATE");
  const identityVerifier = env("CHARTER_IDENTITY_VERIFIER");
  const claimTopic = Number(process.env.CHARTER_CLAIM_TOPIC ?? 1);

  const chaves = agentes.map(() => Keypair.random());
  const regras = agentes.map((a, i) =>
    agentRule(a, Buffer.from(chaves[i].rawPublicKey()), {
      gate,
      verifier: env("CHARTER_ED25519_VERIFIER"),
      target: env("CHARTER_TARGET"),
      identityVerifier,
      claimTopic,
    }),
  );

  const fonte = await server.getAccount(admin.publicKey());
  const tx = new TransactionBuilder(fonte, { fee: "5000000", networkPassphrase: PASS })
    .addOperation(
      Operation.invokeContractFunction({
        contract: registry,
        function: "create_org",
        args: [sym(org), addr(admin.publicKey()), addr(gate), xdr.ScVal.scvVec(regras)],
      }),
    )
    .setTimeout(60)
    .build();

  const { hash, res } = await enviar(tx, admin);
  return {
    hash,
    account: String(scValToNative(res.returnValue!)),
    agentes: agentes.map((a, i) => ({ label: a.label, publicKey: chaves[i].publicKey() })),
  };
}

// ---------------------------------------------------------------------------
// Gestão de agentes
// ---------------------------------------------------------------------------

/**
 * Adiciona um agente com a carteira que o administrador indicar.
 *
 * A autorização vem da regra do administrador dentro da conta corporativa
 * (`Signer::Delegated`), então basta o fundador assinar a transação. A chave do
 * agente nunca passa por aqui: o que se registra é o endereço dele.
 */
export async function adicionarAgente(
  org: string,
  a: { label: string; carteira: string; allowedFns: string[]; kybThreshold: string },
) {
  const admin = Keypair.fromSecret(env("ADMIN_SECRET"));
  const registry = env("CHARTER_REGISTRY");
  const gate = env("CHARTER_GATE");

  const regra = agentRule(
    { label: a.label, allowedFns: a.allowedFns, kybThreshold: a.kybThreshold },
    // `Signer::Delegated` aceita o endereço da carteira direto — sem verifier
    // externo e sem chave pública em bytes.
    null,
    {
      gate,
      verifier: env("CHARTER_ED25519_VERIFIER"),
      target: env("CHARTER_TARGET"),
      identityVerifier: env("CHARTER_IDENTITY_VERIFIER"),
      claimTopic: Number(process.env.CHARTER_CLAIM_TOPIC ?? 1),
      delegado: a.carteira,
    },
  );

  const fonte = await server.getAccount(admin.publicKey());
  const tx = new TransactionBuilder(fonte, { fee: "5000000", networkPassphrase: PASS })
    .addOperation(
      Operation.invokeContractFunction({
        contract: registry,
        function: "add_agent",
        args: [sym(org), regra],
      }),
    )
    .setTimeout(60)
    .build();

  const { hash } = await enviar(tx, admin);
  return { hash, label: a.label, carteira: a.carteira };
}

export async function removerAgente(org: string, label: string) {
  const admin = Keypair.fromSecret(env("ADMIN_SECRET"));
  const fonte = await server.getAccount(admin.publicKey());

  const tx = new TransactionBuilder(fonte, { fee: "5000000", networkPassphrase: PASS })
    .addOperation(
      Operation.invokeContractFunction({
        contract: env("CHARTER_REGISTRY"),
        function: "remove_agent",
        args: [sym(org), sym(label)],
      }),
    )
    .setTimeout(60)
    .build();

  const { hash } = await enviar(tx, admin);
  return { hash, label };
}
