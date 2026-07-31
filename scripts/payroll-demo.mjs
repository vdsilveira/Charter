/**
 * Fluxo E do SPEC — folha de pagamento confidencial.
 *
 * A tesouraria da organização paga um fornecedor com o **valor oculto**. Na
 * rede fica visível quem pagou quem; quanto, não. O destinatário recupera o
 * valor decifrando o evento com a própria chave de visão.
 *
 * Roda sobre o token confidencial com `KybPolicy`: as duas contas envolvidas
 * precisam de claim KYB válido, senão a operação é recusada antes de qualquer
 * criptografia. É a mesma regra da camada pública, no espaço privado.
 *
 * Uso: node scripts/payroll-demo.mjs
 */
import { readFileSync } from "node:fs";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import {
  ChainClient, CircuitProver, FR_MODULUS, MemoryStore, StateEngine, addressToField,
  buildRegisterWitness, buildTransferWitness, deriveKeys, keypairSigner,
  submitDeposit, submitMerge, submitRegister, submitTransfer,
} from "@ctd/sdk";
import { loadCircuit } from "@ctd/sdk/proving/artifacts";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const RPC = "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const AUDITOR_ID = 0;
const SALARY = 400n;
const FUNDING = 1000n;

const dep = JSON.parse(readFileSync(new URL("../deployments/testnet.json", import.meta.url)));
const TOKEN = process.env.GATED_TOKEN ?? dep.charter.gatedConfidentialToken;

const secret = (alias) =>
  execFileSync("stellar", ["keys", "show", alias], { encoding: "utf8" }).trim();

const client = new ChainClient({
  rpcUrl: RPC,
  networkPassphrase: PASS,
  contracts: {
    token: TOKEN,
    verifier: dep.confidential.verifier,
    auditor: dep.confidential.auditor,
  },
});

const addrF = addressToField(TOKEN);
// `client.latestLedger()` — não existe `client.rpc`; o fallback silencioso
// para 0 fazia o engine varrer a rede inteira em vez de falhar.
const fromLedger = Math.max((await client.latestLedger()) - 100_000, 1);

/**
 * Raiz determinística das chaves confidenciais.
 *
 * O opening `(v, r)` de um saldo vive só no cliente: se a raiz mudar entre
 * execuções, o saldo anterior fica inacessível e o contrato não pode ajudar,
 * porque nunca soube o valor. Uma raiz aleatória — como no e2e do demo, que
 * usa contas descartáveis — inviabiliza qualquer estado durável.
 *
 * Em produção isto vem de uma assinatura SEP-53 do próprio signatário.
 */
function rootFor(secretKey) {
  const digest = createHash("sha256").update(`charter:${secretKey}:${TOKEN}`).digest("hex");
  return BigInt(`0x${digest}`) % FR_MODULUS;
}

function party(alias) {
  const kp = Keypair.fromSecret(secret(alias));
  const keys = deriveKeys(rootFor(kp.secret()), addrF);
  return {
    alias,
    kp,
    keys,
    signer: keypairSigner(kp.secret(), PASS),
    engine: new StateEngine({
      client,
      store: new MemoryStore(),
      keys,
      address: kp.publicKey(),
      fromLedger,
    }),
  };
}

console.log(`token confidencial = ${TOKEN}\n`);

const treasury = party("tesouraria");
const vendor = party("fornecedor");
console.log(`tesouraria = ${treasury.kp.publicKey()}`);
console.log(`fornecedor = ${vendor.kp.publicKey()}\n`);

const registerProver = new CircuitProver(loadCircuit("register"));
const transferProver = new CircuitProver(loadCircuit("transfer"));

// --- 1. contas confidenciais ------------------------------------------------
console.log("1/4 abrindo contas confidenciais…");
for (const p of [treasury, vendor]) {
  const w = buildRegisterWitness(p.keys);
  const { proof } = await registerProver.prove(w.inputs);
  try {
    const r = await submitRegister(client, p.signer, p.kp.publicKey(), AUDITOR_ID, w, proof);
    console.log(`    ${p.alias}: ${r.hash.slice(0, 12)}…`);
  } catch (err) {
    // 3500 = AccountAlreadyRegistered. Com raiz determinística, a conta que já
    // existe é a nossa — seguir é correto, não é atalho.
    if (!String(err?.message ?? err).includes("3500")) throw err;
    console.log(`    ${p.alias}: já aberta`);
  }
}

// --- 2. tesouro ------------------------------------------------------------
console.log(`\n2/4 financiando o tesouro (${FUNDING})…`);
let before = await treasury.engine.sync();
if (before.spendable.v < SALARY) {
  await submitDeposit(client, treasury.signer, treasury.kp.publicKey(), treasury.kp.publicKey(), FUNDING);
  await submitMerge(client, treasury.signer, treasury.kp.publicKey());
  before = await treasury.engine.sync();
}
console.log(`    gastável = ${before.spendable.v}`);

// --- 3. pagamento confidencial ---------------------------------------------
console.log(`\n3/4 pagando o fornecedor (${SALARY}) — valor oculto na rede…`);
// A chave do auditor é a mesma para remetente e destinatário: a organização
// designou um auditor só, e é ele que pode abrir os dois canais.
const kAud = await client.auditorKey(AUDITOR_ID);
const state = await treasury.engine.current();
const w = buildTransferWitness({
  keys: treasury.keys,
  v: state.spendable.v,
  r: state.spendable.r,
  amount: SALARY,
  pvkB: vendor.keys.PVK,
  kAudR: kAud,
  kAudS: kAud,
});
const { proof } = await transferProver.prove(w.inputs);
const tx = await submitTransfer(client, treasury.signer, treasury.kp.publicKey(), vendor.kp.publicKey(), w, proof);
console.log(`    liquidado: ${tx.hash.slice(0, 12)}…`);

// --- 4. quem tem a chave, lê ------------------------------------------------
console.log("\n4/4 o fornecedor decifra o próprio recebimento…");
const after = await vendor.engine.sync();
console.log(`    recebido = ${after.receiving.v}`);

const treasuryAfter = await treasury.engine.sync();
console.log(`    tesouro restante = ${treasuryAfter.spendable.v}`);

if (after.receiving.v !== SALARY) {
  console.error(`✗ o fornecedor deveria ter recebido ${SALARY}`);
  process.exit(1);
}
console.log("\n✅ folha paga: a rede viu quem pagou quem, não quanto.");
