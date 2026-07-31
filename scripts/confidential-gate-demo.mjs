/**
 * Prova, contra a testnet, o que sustenta a trilha Enterprise:
 *
 *   o MESMO registro de identidade que autoriza o pagamento do agente também
 *   governa o espaço confidencial.
 *
 *   1. conta COM claim KYB → deposita no token confidencial
 *   2. conta SEM claim KYB → recusada com NotAuthorizedByPolicy (3602)
 *
 * O token é um `token_with_compliance` da OpenZeppelin configurado com
 * `ComplianceConfig { policy: KybPolicy }`: a cada operação que muda estado ele
 * chama `is_authorized(account, token)` para cada conta nomeada, e a nossa
 * policy responde consultando o identity registry da suíte RWA.
 *
 * Por que `deposit` e não `register`: o hook de compliance é o mesmo nos dois
 * caminhos, mas `deposit` não exige prova ZK. Prova a mesma coisa em segundos,
 * e uma demo ao vivo não deve depender do tempo de carga do backend do bb.js.
 *
 * Uso: GATED_TOKEN=C… SUPPLIER_SECRET=S… STRANGER_SECRET=S… node scripts/confidential-gate-demo.mjs
 */
import { readFileSync } from "node:fs";
import {
  Address, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, rpc,
} from "@stellar/stellar-sdk";

const RPC = "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const server = new rpc.Server(RPC);

const ident = JSON.parse(
  readFileSync(new URL("../deployments/identity-testnet.json", import.meta.url)),
);
const TOKEN = process.env.GATED_TOKEN;
if (!TOKEN) throw new Error("defina GATED_TOKEN (token confidencial com KybPolicy)");

const AMOUNT = 1_000_000n; // 0,1 XLM

/** Deposita `from → to` e devolve o que a rede respondeu. */
async function deposit(fromSecret, toAddress) {
  const kp = Keypair.fromSecret(fromSecret);
  const source = await server.getAccount(kp.publicKey());

  const tx = new TransactionBuilder(source, { fee: "2000000", networkPassphrase: PASS })
    .addOperation(
      Operation.invokeContractFunction({
        contract: TOKEN,
        function: "deposit",
        args: [
          new Address(kp.publicKey()).toScVal(),
          new Address(toAddress).toScVal(),
          nativeToScVal(AMOUNT, { type: "i128" }),
        ],
      }),
    )
    .setTimeout(60)
    .build();

  try {
    const prepared = await server.prepareTransaction(tx);
    prepared.sign(kp);
    const sent = await server.sendTransaction(prepared);
    if (sent.status === "ERROR") throw new Error(JSON.stringify(sent.errorResult ?? sent));

    let res = await server.getTransaction(sent.hash);
    for (let i = 0; i < 30 && res.status === "NOT_FOUND"; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      res = await server.getTransaction(sent.hash);
    }
    if (res.status !== "SUCCESS") throw new Error(`tx ${sent.hash}: ${res.status}`);
    return { ok: true, hash: sent.hash };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

console.log(`token confidencial = ${TOKEN}`);
console.log(`identity verifier  = ${ident.identityVerifier}\n`);

console.log("1/2 conta COM claim KYB (fornecedor)…");
const verified = await deposit(process.env.SUPPLIER_SECRET, ident.supplier);
if (!verified.ok) {
  console.error(`    ✗ deveria ter passado: ${verified.error.slice(0, 300)}`);
  process.exit(1);
}
console.log(`    depósito liquidado: ${verified.hash.slice(0, 12)}…`);

console.log("\n2/2 conta SEM claim KYB (desconhecido)…");
const stranger = await deposit(process.env.STRANGER_SECRET, ident.supplier);
if (stranger.ok) {
  console.error("    ✗ FALHA: o token aceitou uma conta sem claim");
  process.exit(1);
}
// 3602 = ComplianceError::NotAuthorizedByPolicy
const byPolicy = stranger.error.includes("3602");
console.log(`    recusada: ${byPolicy ? "NotAuthorizedByPolicy (3602)" : stranger.error.slice(0, 220)}`);
if (!byPolicy) process.exit(1);

console.log("\n✅ o mesmo identity registry governa o pagamento público e o espaço confidencial.");
