/**
 * Deploy do token confidencial com o gate de identidade do Charter.
 *
 * Vai por aqui, e não pelo `stellar` CLI, por um motivo que custou caro
 * descobrir: o parâmetro `policy` é `Option<Address>`, e o CLI aceitou tanto
 * `--policy <C…>` quanto `--policy-file-path` e gravou **None** — sem erro,
 * sem aviso. O token subiu sem gate algum e só se percebeu quando uma conta
 * sem claim conseguiu registrar.
 *
 * Por isso este script confere a configuração depois de subir: um deploy que
 * "funciona" mas não configura o gate é pior que um deploy que falha.
 *
 * Uso: ADMIN_SECRET=S… node scripts/deploy-gated-token.mjs <kybPolicy>
 */
import { readFileSync } from "node:fs";
import {
  Address, Keypair, Networks, Operation, TransactionBuilder, rpc, scValToNative, xdr,
} from "@stellar/stellar-sdk";
import { createHash, randomBytes } from "node:crypto";

const RPC = "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const server = new rpc.Server(RPC);

const policyAddr = process.argv[2];
if (!policyAddr) throw new Error("uso: deploy-gated-token.mjs <endereço da KybPolicy>");

const dep = JSON.parse(readFileSync(new URL("../deployments/testnet.json", import.meta.url)));
const admin = Keypair.fromSecret(process.env.ADMIN_SECRET);

const wasm = readFileSync(new URL("../vendor/ctd-sdk/contracts/token_with_compliance.wasm", import.meta.url));
const wasmHash = createHash("sha256").update(wasm).digest();

async function send(tx) {
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
  return res;
}

async function builder() {
  return new TransactionBuilder(await server.getAccount(admin.publicKey()), {
    fee: "2000000",
    networkPassphrase: PASS,
  });
}

// O wasm já está instalado na rede (o demo o subiu); se não estivesse,
// uploadContractWasm resolveria. Aqui só referenciamos o hash.
const tx = (await builder())
  .addOperation(
    Operation.createCustomContract({
      address: new Address(admin.publicKey()),
      wasmHash,
      salt: randomBytes(32),
      constructorArgs: [
        new Address(admin.publicKey()).toScVal(), // owner
        new Address(dep.confidential.underlying).toScVal(), // underlying (XLM SAC)
        new Address(dep.confidential.verifier).toScVal(), // verificador UltraHonk
        new Address(dep.confidential.auditor).toScVal(), // registro de auditores
        // Option<Address>::Some — em Soroban, Some é o próprio valor; None é Void.
        // Era exatamente aqui que o CLI escrevia Void sem reclamar.
        new Address(policyAddr).toScVal(),
      ],
    }),
  )
  .setTimeout(60)
  .build();

const res = await send(tx);
const token = Address.fromScVal(res.returnValue).toString();
console.log("token =", token);

// --- conferência: o gate ficou mesmo configurado? --------------------------
const key = xdr.LedgerKey.contractData(
  new xdr.LedgerKeyContractData({
    contract: new Address(token).toScAddress(),
    key: xdr.ScVal.scvLedgerKeyContractInstance(),
    durability: xdr.ContractDataDurability.persistent(),
  }),
);
const entries = await server.getLedgerEntries(key);
const storage = entries.entries[0].val.contractData().val().instance().storage() ?? [];
const config = storage
  .map((e) => [scValToNative(e.key()), scValToNative(e.val())])
  .find(([k]) => Array.isArray(k) && k[0] === "Config");

if (!config || config[1]?.policy !== policyAddr) {
  console.error("✗ policy NÃO configurada:", JSON.stringify(config?.[1] ?? null));
  process.exit(1);
}
console.log("policy confirmada:", config[1].policy);
console.log("sac_passthrough:", config[1].sac_passthrough);
