/**
 * Constitui a AlphaFund — Fluxo A do SPEC.
 *
 * Uma transação cria a conta corporativa com uma procuração por agente e
 * registra os rótulos. Vai por script, e não pelo CLI, porque
 * `AgentRule.policies` é `Map<Address, Val>`: o CLI não serializa a struct de
 * parâmetros num campo de tipo livre — mesmo obstáculo do `add_identity`.
 *
 * Uso: ADMIN_SECRET=S… CHARTER_REGISTRY=C… CHARTER_GATE=C… node scripts/create-org.mjs
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  Address, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr,
} from "@stellar/stellar-sdk";

const RPC = "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const server = new rpc.Server(RPC);

const dep = JSON.parse(readFileSync(new URL("../deployments/testnet.json", import.meta.url)));
const ident = JSON.parse(
  readFileSync(new URL("../deployments/identity-testnet.json", import.meta.url)),
);

const REGISTRY = process.env.CHARTER_REGISTRY;
const GATE = process.env.CHARTER_GATE;
const ORG = process.env.ORG_NAME ?? "alphafund";
const admin = Keypair.fromSecret(process.env.ADMIN_SECRET);
const XLM_SAC = dep.confidential.underlying;
const VERIFIER_ED25519 = dep.accounts.ed25519Verifier;

if (!REGISTRY || !GATE) throw new Error("defina CHARTER_REGISTRY e CHARTER_GATE");

const sym = (s) => xdr.ScVal.scvSymbol(s);
const entry = (k, v) => new xdr.ScMapEntry({ key: sym(k), val: v });
const i128 = (v) => nativeToScVal(v, { type: "i128" });
const addr = (a) => new Address(a).toScVal();

const agentKey = (alias) => {
  execFileSync("stellar", ["keys", "generate", alias, "--network", "testnet", "--fund"], {
    stdio: "ignore",
  });
  return Keypair.fromSecret(
    execFileSync("stellar", ["keys", "show", alias], { encoding: "utf8" }).trim(),
  );
};

/** GateParams — chaves em ordem alfabética, como todo struct em Soroban. */
function gateParams({ allowedFns, threshold, label }) {
  return xdr.ScVal.scvMap([
    entry("agent_label", sym(label)),
    entry("allowed_fns", xdr.ScVal.scvVec(allowedFns.map(sym))),
    entry("claim_topic", xdr.ScVal.scvU32(ident.kybTopic ?? 1)),
    entry("identity_registry", addr(ident.identityVerifier)),
    entry("kyb_threshold", i128(threshold)),
  ]);
}

/** AgentRule { label, policies, signers, target, valid_until } */
function agentRule({ label, pubkey, allowedFns, threshold }) {
  const signer = xdr.ScVal.scvVec([
    sym("External"),
    addr(VERIFIER_ED25519),
    xdr.ScVal.scvBytes(pubkey),
  ]);
  return xdr.ScVal.scvMap([
    entry("label", xdr.ScVal.scvString(label)),
    entry(
      "policies",
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: addr(GATE),
          val: gateParams({ allowedFns, threshold, label }),
        }),
      ]),
    ),
    entry("signers", xdr.ScVal.scvVec([signer])),
    entry("target", addr(XLM_SAC)),
    entry("valid_until", xdr.ScVal.scvVoid()),
  ]);
}

const trader = agentKey("agent-trader");
const auditor = agentKey("agent-auditor");

const agents = xdr.ScVal.scvVec([
  // O trader move valor: `transfer` no escopo, limiar de KYB acima de 500.
  agentRule({
    label: "trader",
    pubkey: trader.rawPublicKey(),
    allowedFns: ["transfer"],
    threshold: 500n,
  }),
  // O auditor não move nada: escopo vazio. É o cenário D da demo.
  agentRule({
    label: "auditor",
    pubkey: auditor.rawPublicKey(),
    allowedFns: [],
    threshold: 0n,
  }),
]);

const source = await server.getAccount(admin.publicKey());
const tx = new TransactionBuilder(source, { fee: "5000000", networkPassphrase: PASS })
  .addOperation(
    Operation.invokeContractFunction({
      contract: REGISTRY,
      function: "create_org",
      args: [sym(ORG), addr(admin.publicKey()), addr(GATE), agents],
    }),
  )
  .setTimeout(60)
  .build();

const prepared = await server.prepareTransaction(tx);
prepared.sign(admin);
const sent = await server.sendTransaction(prepared);
if (sent.status === "ERROR") throw new Error(JSON.stringify(sent.errorResult ?? sent));

let res = await server.getTransaction(sent.hash);
for (let i = 0; i < 40 && res.status === "NOT_FOUND"; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  res = await server.getTransaction(sent.hash);
}
if (res.status !== "SUCCESS") throw new Error(`tx ${sent.hash} falhou: ${res.status}`);

console.log(`organização  = ${ORG}`);
console.log(`conta        = ${scValToNative(res.returnValue)}`);
console.log(`trader       = ${trader.publicKey()}`);
console.log(`auditor      = ${auditor.publicKey()}`);
console.log(`tx           = ${sent.hash}`);
