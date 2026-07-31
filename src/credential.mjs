/**
 * Leitura da credencial de um agente.
 *
 * É o critério do PRD (RF-8.1): a contraparte decide contratar com **uma**
 * leitura on-chain, sem indexador e sem confiar no operador. Tudo o que a
 * função abaixo faz é uma simulação de `credentials_of` — que por sua vez
 * agrega, dentro do contrato, procuração, conduta e status de verificação.
 */
import {
  Address, Keypair, Networks, Operation, TransactionBuilder, rpc, scValToNative, xdr,
} from "@stellar/stellar-sdk";

const RPC = process.env.STELLAR_RPC ?? "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const server = new rpc.Server(RPC);

// Conta descartável só para simular: leitura não gasta transação nem exige
// carteira conectada — a credencial é para quem ainda não é cliente.
const READER = Keypair.random().publicKey();

const sym = (s) => xdr.ScVal.scvSymbol(s);

export class CredentialError extends Error {
  constructor(message, { status = 500, code = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Extrai o código de erro de contrato de uma mensagem da RPC. */
function contractError(text) {
  const m = /Error\(Contract, #(\d+)\)/.exec(String(text ?? ""));
  return m ? Number(m[1]) : null;
}

export async function credentialsOf(registry, org, label) {
  const source = await server.getAccount(READER).catch(() => ({
    accountId: () => READER,
    sequenceNumber: () => "0",
    incrementSequenceNumber: () => {},
  }));

  const tx = new TransactionBuilder(
    typeof source.accountId === "function" ? source : source,
    { fee: "1000000", networkPassphrase: PASS },
  )
    .addOperation(
      Operation.invokeContractFunction({
        contract: registry,
        function: "credentials_of",
        args: [sym(org), sym(label)],
      }),
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    const code = contractError(sim.error);
    // 5001 OrgNotFound · 5002 AgentNotFound — para quem consulta, os dois são
    // "não existe"; o que não pode acontecer é devolver 500 e um stack trace.
    if (code === 5001 || code === 5002) {
      throw new CredentialError("organização ou agente não encontrado", { status: 404, code });
    }
    throw new CredentialError(sim.error, { status: 502, code });
  }

  const raw = scValToNative(sim.result.retval);
  return normalize(raw);
}

/** Converte bigints e Symbols para algo que atravessa JSON. */
function normalize(c) {
  return {
    org: String(c.org),
    label: String(c.label),
    account: String(c.account),
    active: Boolean(c.active),
    orgVerified: Boolean(c.org_verified),
    policy: {
      allowedFns: (c.params?.allowed_fns ?? []).map(String),
      kybThreshold: String(c.params?.kyb_threshold ?? 0n),
      identityRegistry: String(c.params?.identity_registry ?? ""),
      claimTopic: Number(c.params?.claim_topic ?? 0),
    },
    conduct: {
      opsOk: Number(c.stats?.ops_ok ?? 0),
      volumeTotal: String(c.stats?.volume_total ?? 0n),
      // Destaque proposital: volume com contrapartes verificadas é o número
      // caro de inflar, e portanto o único que significa alguma coisa.
      volumeAttested: String(c.stats?.volume_attested ?? 0n),
      firstSeen: Number(c.stats?.first_seen ?? 0),
    },
  };
}

/**
 * Decisões de política registradas na cadeia.
 *
 * Reconstruído só de eventos — sem banco próprio, que é o requisito RF-9.3.
 * Só o caminho aprovado aparece: a recusa reverte a transação e leva o evento
 * junto, então tentativa bloqueada se lê das transações falhadas, não daqui.
 */
export async function policyDecisions(gate, { fromLedger } = {}) {
  const latest = (await server.getLatestLedger()).sequence;
  const start = fromLedger ?? Math.max(latest - 100_000, 1);

  const { events } = await server.getEvents({
    startLedger: start,
    filters: [{ type: "contract", contractIds: [gate] }],
    limit: 200,
  });

  return events.map((e) => {
    const data = scValToNative(e.value);
    return {
      ledger: e.ledger,
      tx: e.txHash,
      agent: String(data?.agent_label ?? ""),
      fn: String(data?.fn_name ?? ""),
      amount: String(data?.amount ?? 0n),
      counterpartyVerified: Boolean(data?.counterparty_verified),
    };
  });
}

export { server, PASS };
