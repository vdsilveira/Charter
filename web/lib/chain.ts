/**
 * Leituras da cadeia usadas pelas rotas do app.
 *
 * Tudo aqui é simulação — nenhuma leitura gasta transação nem exige carteira.
 * É o que permite a página pública responder para quem ainda não é cliente,
 * que é o ponto do produto.
 */
import {
  Account, Address, Keypair, Networks, Operation, TransactionBuilder, rpc, scValToNative, xdr,
} from "@stellar/stellar-sdk";
// Importado pelo efeito: carrega o `.env.demo` antes de `REGISTRY` ser lido
// abaixo. Sem isso, quem importar este módulo primeiro pega string vazia.
import "./env-servidor";

const RPC = process.env.STELLAR_RPC ?? "https://soroban-testnet.stellar.org";
export const PASS = Networks.TESTNET;
export const server = new rpc.Server(RPC);

export const REGISTRY = process.env.CHARTER_REGISTRY ?? "";
export const GATE = process.env.CHARTER_GATE ?? "";

// Conta sintética para simular: a simulação não valida a fonte, então não é
// preciso que ela exista na rede — buscá-la só criaria uma dependência a mais
// e uma falha a mais. É o que permite ler sem carteira e sem financiar nada.
const LEITOR = new Account(Keypair.random().publicKey(), "0");

const sym = (s: string) => xdr.ScVal.scvSymbol(s);

export class ErroDeLeitura extends Error {
  status: number;
  codigo: number | null;
  constructor(msg: string, status = 500, codigo: number | null = null) {
    super(msg);
    this.status = status;
    this.codigo = codigo;
  }
}

function codigoDeContrato(texto: unknown): number | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(String(texto ?? ""));
  return m ? Number(m[1]) : null;
}

async function simular(contrato: string, fn: string, args: xdr.ScVal[]) {
  const tx = new TransactionBuilder(LEITOR, { fee: "1000000", networkPassphrase: PASS })
    .addOperation(Operation.invokeContractFunction({ contract: contrato, function: fn, args }))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    const codigo = codigoDeContrato(sim.error);
    // 5001 OrgNotFound · 5002 AgentNotFound — para quem consulta, os dois são
    // "não existe". O que não pode é devolver 500 com stack trace.
    if (codigo === 5001 || codigo === 5002) {
      throw new ErroDeLeitura("organização ou agente não encontrado", 404, codigo);
    }
    throw new ErroDeLeitura(sim.error, 502, codigo);
  }
  return scValToNative(sim.result!.retval);
}

export interface Credencial {
  org: string;
  label: string;
  account: string;
  active: boolean;
  orgVerified: boolean;
  policy: {
    allowedFns: string[];
    kybThreshold: string;
    identityRegistry: string;
    claimTopic: number;
    /** Teto acumulado em stroops; `null` é sem teto. */
    maxVolume: string | null;
  };
  conduct: { opsOk: number; volumeTotal: string; volumeAttested: string; firstSeen: number };
}

export async function credencialDe(org: string, label: string): Promise<Credencial> {
  const c = await simular(REGISTRY, "credentials_of", [sym(org), sym(label)]);
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
      // `null` é sem teto — diferente de zero, que impede qualquer movimento.
      maxVolume: c.params?.max_volume == null ? null : String(c.params.max_volume),
    },
    conduct: {
      opsOk: Number(c.stats?.ops_ok ?? 0),
      volumeTotal: String(c.stats?.volume_total ?? 0n),
      volumeAttested: String(c.stats?.volume_attested ?? 0n),
      firstSeen: Number(c.stats?.first_seen ?? 0),
    },
  };
}

export interface Decisao {
  tx: string;
  ledger: number;
  /** Para quem o valor foi. */
  para: string;
  amount: string;
  counterpartyVerified: boolean;
}

/**
 * Decisões aprovadas, reconstruídas de eventos — sem banco próprio.
 *
 * A recusa não aparece aqui porque reverte a transação e leva o evento junto;
 * ela se lê das transações falhadas. É a mesma razão pela qual a UI simula
 * antes de enviar.
 */
/**
 * Operações liquidadas pela conta corporativa, lidas dos eventos do ativo.
 *
 * Antes isto vinha de um evento próprio do `ComplianceGate`. Ele saiu porque o
 * facilitador do x402 **recusa qualquer evento de contrato que não seja um
 * `transfer`** — não ignora, recusa —, o que tornava toda operação de uma
 * organização Charter irreceptível para o padrão. Instrumentação nossa não pode
 * custar interoperabilidade: a garantia sempre esteve no `panic` do gate, que
 * reverte a transação, não no evento.
 *
 * O que se perde é a atribuição por agente em cada linha. Ela não some do
 * produto — vive no `AgentStats`, que alimenta o ranking.
 */
export async function decisoes(contaOrg?: string): Promise<Decisao[]> {
  const conta = contaOrg ?? process.env.CHARTER_ORG_ACCOUNT ?? "";
  const alvo = process.env.CHARTER_TARGET ?? "";
  if (!conta || !alvo) return [];

  const ultimo = (await server.getLatestLedger()).sequence;
  const { events } = await server.getEvents({
    startLedger: Math.max(ultimo - 100_000, 1),
    filters: [
      {
        type: "contract",
        contractIds: [alvo],
        // `transfer` com a conta corporativa na origem: é o que a organização
        // moveu, e nada do que apenas passou pelo mesmo token.
        topics: [[sym("transfer").toXDR("base64"), new Address(conta).toScVal().toXDR("base64"), "*"]],
      },
    ],
    limit: 200,
  });

  const brutos = events.map((e) => ({
    tx: e.txHash,
    ledger: e.ledger,
    para: String(scValToNative(e.topic[2])),
    amount: String(scValToNative(e.value) ?? 0n),
  }));

  // Uma verificação por contraparte distinta, não uma por linha: é a coluna que
  // separa volume que conta de volume que não conta, e não vale gastar dezenas
  // de leituras para repetir a mesma resposta.
  const distintas = [...new Set(brutos.map((b) => b.para))];
  const verificadas = new Map<string, boolean>();
  for (const conta of distintas) {
    verificadas.set(conta, await contaVerificada(conta));
  }

  return brutos.map((b) => ({ ...b, counterpartyVerified: verificadas.get(b.para) ?? false }));
}

/** A contraparte tem claim válido? Fail-closed, como o gate. */
async function contaVerificada(conta: string): Promise<boolean> {
  try {
    await simular(process.env.CHARTER_IDENTITY_VERIFIER ?? "", "verify_identity", [
      new Address(conta).toScVal(),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function ranking(org: string, labels: string[]) {
  const linhas = [];
  for (const label of labels) {
    try {
      const c = await credencialDe(org, label);
      linhas.push({
        label: c.label,
        active: c.active,
        opsOk: c.conduct.opsOk,
        volumeTotal: c.conduct.volumeTotal,
        volumeAttested: c.conduct.volumeAttested,
      });
    } catch (e) {
      if (!(e instanceof ErroDeLeitura) || e.status !== 404) throw e;
    }
  }
  return linhas;
}

export { Address };

export interface InfoOrg {
  name: string;
  founder: string;
  account: string;
  agents: string[];
}

/**
 * A organização como o registro a conhece **agora**.
 *
 * É daqui que sai a lista de agentes. O histórico da conta serve para descobrir
 * *quais* organizações uma carteira fundou — o registro não indexa por
 * fundador —, mas quem foi adicionado ou removido depois só o registro sabe.
 */
export async function orgDe(org: string): Promise<InfoOrg> {
  const info = await simular(REGISTRY, "org_of", [sym(org)]);
  return {
    name: String(info.name),
    founder: String(info.founder),
    account: String(info.account),
    agents: (info.agents ?? []).map(String),
  };
}

/**
 * Saldo da conta corporativa no ativo que os agentes movem.
 *
 * É o que limita a operação do agente — não a taxa, que o patrocinador paga.
 * Confundir os dois leva a financiar a conta errada e continuar sem entender
 * por que a transferência falha.
 */
export async function saldoDaOrg(org: string): Promise<string> {
  const { account } = await orgDe(org);
  const alvo = process.env.CHARTER_TARGET ?? "";
  const saldo = await simular(alvo, "balance", [new Address(account).toScVal()]);
  return String(saldo ?? "0");
}
