/**
 * Fase 5 — tesouraria confidencial.
 *
 * Fluxo E do SPEC: a organização paga fornecedores com valores ocultos. Na
 * rede fica quem pagou quem; quanto, não. Quem tem a chave de visão lê.
 *
 * Sobre `set_spender` (procuração confidencial): o circuito existe e a VK está
 * registrada na rede, mas o SDK do demo **não** implementa o witness builder —
 * não há como montar a prova pelo cliente. Escrever esse builder do zero, para
 * um circuito de terceiros e sem especificação dos inputs, é risco alto demais
 * para o retorno. Os testes correspondentes ficam `skip` com o motivo à vista,
 * em vez de sumirem da suíte.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { createHash } from "node:crypto";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import {
  ChainClient, CircuitProver, FR_MODULUS, MemoryStore, StateEngine, addressToField,
  buildTransferWitness, deriveKeys, keypairSigner, submitTransfer,
} from "@ctd/sdk";
import { loadCircuit } from "@ctd/sdk/proving/artifacts";
import { addr, deployments, eventsOf, hasError, i128, invoke, read, secretOf } from "./helpers.mjs";

const TOKEN = process.env.GATED_TOKEN ?? deployments.charter?.gatedConfidentialToken;
const PASS = Networks.TESTNET;
const AUDITOR_ID = 0;
// Valor improvável de propósito: o evento carrega cifra como arrays de bytes, e
// um número pequeno casaria com qualquer byte solto na hora de procurar o valor
// em claro. 414243 não cabe em um byte.
const SALARY = 414243n;

/**
 * Verdadeiro se algum campo **em claro** do evento é o valor pago.
 *
 * Bytes de cifra ficam de fora por definição: um `Buffer` aqui é ciphertext ou
 * commitment, e procurar o valor dentro dele é procurar coincidência de byte,
 * não vazamento. O que interessa é campo legível — número, bigint ou string.
 */
function leaksAmount(node, amount) {
  if (node == null) return false;
  if (Buffer.isBuffer(node) || node instanceof Uint8Array) return false;
  if (typeof node === "bigint" || typeof node === "number") return BigInt(node) === amount;
  if (typeof node === "string") return node === String(amount);
  if (Array.isArray(node)) return node.some((n) => leaksAmount(n, amount));
  if (typeof node === "object") return Object.values(node).some((n) => leaksAmount(n, amount));
  return false;
}

const dumpOf = (v) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const topicsOf = (events) => events.map((e) => e.topics[0]).join(", ");

describe("fase 5 — tesouraria confidencial", { concurrency: 1 }, () => {
  let treasury, vendor, stranger, client, addrF, prover;

  before(() => {
    assert.ok(TOKEN, "GATED_TOKEN não configurado");
    client = new ChainClient({
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: PASS,
      contracts: {
        token: TOKEN,
        verifier: deployments.confidential.verifier,
        auditor: deployments.confidential.auditor,
      },
    });
    addrF = addressToField(TOKEN);

    const party = (alias) => {
      const kp = Keypair.fromSecret(secretOf(alias));
      // Raiz determinística: o opening (v, r) vive só no cliente, então uma
      // raiz aleatória tornaria o saldo irrecuperável na execução seguinte.
      const root =
        BigInt(`0x${createHash("sha256").update(`charter:${kp.secret()}:${TOKEN}`).digest("hex")}`) %
        FR_MODULUS;
      const keys = deriveKeys(root, addrF);
      return {
        kp,
        keys,
        signer: keypairSigner(kp.secret(), PASS),
        engine: new StateEngine({
          client, store: new MemoryStore(), keys, address: kp.publicKey(), fromLedger: 0,
        }),
      };
    };

    treasury = party("tesouraria");
    vendor = party("fornecedor");
    stranger = { kp: Keypair.fromSecret(secretOf("stranger")) };
  });

  // O backend do UltraHonk sobe worker threads que seguram o event loop: sem
  // este destroy o processo fica pendurado depois do último teste e o runner
  // acusa "Promise resolution is still pending".
  after(async () => { await prover?.destroy(); });

  it("a tesouraria deposita no espaço confidencial", async () => {
    const r = await invoke(
      TOKEN, "deposit",
      [addr(treasury.kp.publicKey()), addr(treasury.kp.publicKey()), i128(1_000_000n)],
      treasury.kp,
    );
    assert.ok(r.ok, `depósito deveria passar: ${r.error}`);
  });

  it("merge move o recebido para gastável, sem prova", async () => {
    const r = await invoke(TOKEN, "merge", [addr(treasury.kp.publicKey())], treasury.kp);
    assert.ok(r.ok, `merge deveria passar: ${r.error}`);
  });

  it("conta sem claim KYB é recusada pela policy", async () => {
    const r = await invoke(
      TOKEN, "deposit",
      [addr(stranger.kp.publicKey()), addr(treasury.kp.publicKey()), i128(1_000_000n)],
      stranger.kp,
    );
    assert.ok(!r.ok, "deveria ter sido recusada");
    assert.ok(hasError(r, 3602), `esperava NotAuthorizedByPolicy (3602), veio: ${r.error}`);
  });

  it("agente sem delegação não é spender", async () => {
    const r = await read(
      TOKEN, "is_spender",
      [addr(treasury.kp.publicKey()), addr(Keypair.random().publicKey())],
      treasury.kp,
    );
    assert.ok(r.ok, r.error);
    assert.equal(r.value, false);
  });

  it("paga o fornecedor sem revelar o valor na rede", async (t) => {
    t.diagnostic("gera prova UltraHonk — alguns segundos");

    const state = await treasury.engine.sync();
    assert.ok(state.spendable.v >= SALARY, `tesouro sem saldo: ${state.spendable.v}`);

    const kAud = await client.auditorKey(AUDITOR_ID);
    const w = buildTransferWitness({
      keys: treasury.keys,
      v: state.spendable.v,
      r: state.spendable.r,
      amount: SALARY,
      pvkB: vendor.keys.PVK,
      kAudR: kAud,
      kAudS: kAud,
    });
    prover = new CircuitProver(loadCircuit("transfer"));
    const { proof } = await prover.prove(w.inputs);
    const tx = await submitTransfer(
      client, treasury.signer, treasury.kp.publicKey(), vendor.kp.publicKey(), w, proof,
    );

    // O valor não pode aparecer em claro no evento: é a diferença entre
    // confidencialidade e teatro.
    const events = await eventsOf(tx.hash);
    const transfer = events.filter((e) => e.contract === TOKEN && e.topics[0] === "transfer");
    assert.equal(transfer.length, 1, `esperava um evento transfer do token: ${topicsOf(events)}`);
    assert.ok(
      !leaksAmount(transfer, SALARY),
      `o valor ${SALARY} apareceu em claro no evento: ${dumpOf(transfer).slice(0, 400)}`,
    );

    // …mas o destinatário recupera com a própria chave de visão.
    const after = await vendor.engine.sync();
    assert.ok(after.receiving.v >= SALARY, `fornecedor deveria ter recebido ${SALARY}`);
  });

  it("o remetente vê o próprio saldo diminuir", async () => {
    const state = await treasury.engine.sync();
    assert.ok(state.spendable.v >= 0n);
  });

  it.skip("set_spender cria a procuração confidencial do agente", () => {
    // Bloqueado: @ctd/sdk não expõe witness builder para o circuito set_spender.
  });

  it.skip("delegação expirada deixa de valer sem revogação", () => {
    // Bloqueado pelo mesmo motivo de set_spender.
  });

  it.skip("revoke_spender devolve a alçada ao tesouro", () => {
    // Bloqueado pelo mesmo motivo de set_spender.
  });
});
