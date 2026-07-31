/**
 * Prova, contra a testnet, o cenário central da trilha Agentic:
 *
 *   1. constitui uma conta corporativa com uma procuração (teto de gasto)
 *   2. financia o tesouro
 *   3. o agente paga DENTRO da política  → liquida
 *   4. o agente paga FORA da política    → recusado on-chain
 *
 * O deploy vai por aqui, e não pelo `stellar` CLI, porque os parâmetros das
 * policies são `Val` livre (`Map<Address, Val>`): o CLI só infere escalares,
 * arrays e maps de chave única, então rejeita a struct de parâmetros — o mesmo
 * obstáculo que apareceu no `add_identity`.
 *
 * Uso: node scripts/agent-payment-demo.mjs
 */
import {
  Address, Keypair, Networks, Operation, TransactionBuilder, rpc, xdr, nativeToScVal,
} from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";
import { createCharterSigner } from "../src/charter-signer.mjs";

const RPC = "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const server = new rpc.Server(RPC);

const dep = JSON.parse(readFileSync(new URL("../deployments/testnet.json", import.meta.url)));
const XLM_SAC = dep.confidential.underlying;
const VERIFIER = dep.accounts.ed25519Verifier;
const SPENDING_LIMIT = dep.accounts.spendingLimitPolicy;
const ACCOUNT_WASM = process.env.ACCOUNT_WASM_HASH;

const admin = Keypair.fromSecret(process.env.ADMIN_SECRET);
const agent = Keypair.fromSecret(process.env.AGENT_SECRET);

const DAILY_LIMIT = 50_000_000n; // 5 XLM em stroops
const WITHIN = 10_000_000n; //  1 XLM — dentro da política
const BEYOND = 90_000_000n; //  9 XLM — acima do teto

const sym = (s) => xdr.ScVal.scvSymbol(s);
const entry = (k, v) => new xdr.ScMapEntry({ key: sym(k), val: v });
const i128 = (v) => nativeToScVal(v, { type: "i128" });

/** Signer::External(verifier, pubkey) */
function externalSigner(verifier, pubkey) {
  return xdr.ScVal.scvVec([sym("External"), new Address(verifier).toScVal(), xdr.ScVal.scvBytes(pubkey)]);
}

/** SpendingLimitAccountParams — chaves em ordem alfabética, como todo struct. */
function spendingLimitParams(limit, periodLedgers) {
  return xdr.ScVal.scvMap([
    entry("period_ledgers", xdr.ScVal.scvU32(periodLedgers)),
    entry("spending_limit", i128(limit)),
  ]);
}

/** AgentRule { label, policies, signers, target, valid_until } */
function agentRule({ label, target, signers, policies }) {
  return xdr.ScVal.scvMap([
    entry("label", xdr.ScVal.scvString(label)),
    entry("policies", xdr.ScVal.scvMap(policies)),
    entry("signers", xdr.ScVal.scvVec(signers)),
    entry("target", new Address(target).toScVal()),
    entry("valid_until", xdr.ScVal.scvVoid()), // None = sem prazo
  ]);
}

async function send(tx, signers) {
  const prepared = await server.prepareTransaction(tx);
  for (const s of signers) prepared.sign(s);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error(JSON.stringify(sent.errorResult ?? sent));

  let res = await server.getTransaction(sent.hash);
  for (let i = 0; i < 40 && res.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await server.getTransaction(sent.hash);
  }
  if (res.status !== "SUCCESS") throw new Error(`tx ${sent.hash} falhou: ${res.status}`);
  return { hash: sent.hash, result: res };
}

async function builder() {
  return new TransactionBuilder(await server.getAccount(admin.publicKey()), {
    fee: "2000000",
    networkPassphrase: PASS,
  });
}

// --- 1. constituir a conta corporativa -------------------------------------
console.log("1/4 constituindo a conta corporativa…");
const rule = agentRule({
  label: "trader",
  target: XLM_SAC,
  signers: [externalSigner(VERIFIER, agent.rawPublicKey())],
  policies: [entry_addr(SPENDING_LIMIT, spendingLimitParams(DAILY_LIMIT, 17280))],
});
function entry_addr(addr, val) {
  return new xdr.ScMapEntry({ key: new Address(addr).toScVal(), val });
}

const salt = Buffer.from(
  await crypto.subtle.digest("SHA-256", Buffer.from(`charter-demo-${Date.now()}`)),
);
const deployTx = (await builder())
  .addOperation(
    Operation.createCustomContract({
      address: new Address(admin.publicKey()),
      wasmHash: Buffer.from(ACCOUNT_WASM, "hex"),
      salt,
      constructorArgs: [xdr.ScVal.scvVec([rule])],
    }),
  )
  .setTimeout(60)
  .build();

const deployed = await send(deployTx, [admin]);
const accountAddr = Address.fromScVal(deployed.result.returnValue).toString();
console.log("   conta =", accountAddr);

// --- 2. financiar o tesouro -------------------------------------------------
console.log("2/4 financiando o tesouro com 20 XLM…");
const fundTx = (await builder())
  .addOperation(
    Operation.invokeContractFunction({
      contract: XLM_SAC,
      function: "transfer",
      args: [
        new Address(admin.publicKey()).toScVal(),
        new Address(accountAddr).toScVal(),
        i128(200_000_000n),
      ],
    }),
  )
  .setTimeout(60)
  .build();
await send(fundTx, [admin]);

// --- pagamento assinado pelo agente ----------------------------------------
const signer = createCharterSigner({
  account: accountAddr,
  agentSecret: process.env.AGENT_SECRET,
  verifier: VERIFIER,
  contextRuleId: 0,
  networkPassphrase: PASS,
  rpc: server,
});

async function agentPays(amount) {
  const dest = Keypair.random().publicKey();
  const op = (auth) =>
    Operation.invokeContractFunction({
      contract: XLM_SAC,
      function: "transfer",
      args: [
        new Address(accountAddr).toScVal(),
        new Address(admin.publicKey()).toScVal(),
        i128(amount),
      ],
      ...(auth ? { auth } : {}),
    });

  // Primeira simulação: descobrir a auth entry que o host espera.
  const probe = (await builder()).addOperation(op()).setTimeout(60).build();
  const sim = await server.simulateTransaction(probe);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);

  const latest = (await server.getLatestLedger()).sequence;
  const signed = [];
  for (const e of sim.result.auth ?? []) {
    const { signedAuthEntry } = await signer.signAuthEntry(e.toXDR("base64"), {
      validUntilLedgerSeq: latest + 60,
    });
    signed.push(xdr.SorobanAuthorizationEntry.fromXDR(signedAuthEntry, "base64"));
  }

  const tx = (await builder()).addOperation(op(signed)).setTimeout(60).build();
  return send(tx, [admin]);
}

console.log(`3/4 pagamento DENTRO da política (${WITHIN} stroops)…`);
const ok = await agentPays(WITHIN);
console.log("   liquidado:", ok.hash);

console.log(`4/4 pagamento FORA da política (${BEYOND} stroops, teto ${DAILY_LIMIT})…`);
try {
  await agentPays(BEYOND);
  console.error("   ✗ FALHA DO TESTE: a rede aceitou um pagamento fora da política");
  process.exit(1);
} catch (err) {
  const msg = String(err.message ?? err);
  // 3221 = SpendingLimitExceeded, da policy da OpenZeppelin
  console.log("   recusado on-chain:", msg.includes("3221") ? "SpendingLimitExceeded (3221)" : msg.slice(0, 200));
}
