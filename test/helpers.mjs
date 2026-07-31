/**
 * Infraestrutura dos testes de integração.
 *
 * Estes testes rodam contra a testnet de verdade. Isso tem duas consequências
 * que moldam tudo aqui: o estado é persistente entre execuções, e a recusa
 * precisa ser identificada pelo código do erro — "deu erro" não prova nada,
 * porque saldo insuficiente e bloqueio de compliance falham igual.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  Address, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, rpc,
  scValToNative, xdr,
} from "@stellar/stellar-sdk";

export const RPC = "https://soroban-testnet.stellar.org";
export const PASS = Networks.TESTNET;
export const server = new rpc.Server(RPC);

export const deployments = JSON.parse(
  readFileSync(new URL("../deployments/testnet.json", import.meta.url)),
);
export const identity = JSON.parse(
  readFileSync(new URL("../deployments/identity-testnet.json", import.meta.url)),
);

/** Chave de uma identidade do `stellar` CLI. */
export function secretOf(alias) {
  return execFileSync("stellar", ["keys", "show", alias], { encoding: "utf8" }).trim();
}

export function addressOf(alias) {
  return execFileSync("stellar", ["keys", "address", alias], { encoding: "utf8" }).trim();
}

/** Conta nova e financiada — para testes que não podem herdar estado. */
export async function freshAccount() {
  const kp = Keypair.random();
  const res = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!res.ok && res.status !== 400) throw new Error(`friendbot: ${res.status}`);
  return kp;
}

export const i128 = (v) => nativeToScVal(v, { type: "i128" });
export const addr = (a) => new Address(a).toScVal();

/**
 * Invoca uma função de contrato. Nunca lança: devolve `{ ok, hash }` ou
 * `{ ok: false, error }`, porque nos testes de recusa o erro é o resultado
 * esperado e precisa ser inspecionado.
 */
export async function invoke(contract, fn, args, signer, extra = {}) {
  try {
    const source = await server.getAccount(signer.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: "3000000",
      networkPassphrase: PASS,
    })
      .addOperation(Operation.invokeContractFunction({ contract, function: fn, args, ...extra }))
      .setTimeout(60)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(signer);
    const sent = await server.sendTransaction(prepared);
    if (sent.status === "ERROR") {
      return { ok: false, error: JSON.stringify(sent.errorResult ?? sent) };
    }

    let res = await server.getTransaction(sent.hash);
    for (let i = 0; i < 30 && res.status === "NOT_FOUND"; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      res = await server.getTransaction(sent.hash);
    }
    if (res.status !== "SUCCESS") return { ok: false, error: `tx ${sent.hash}: ${res.status}` };
    return { ok: true, hash: sent.hash, returnValue: res.returnValue };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/** Leitura por simulação — não gasta transação. */
export async function read(contract, fn, args, signer) {
  const source = await server.getAccount(signer.publicKey());
  const tx = new TransactionBuilder(source, { fee: "3000000", networkPassphrase: PASS })
    .addOperation(Operation.invokeContractFunction({ contract, function: fn, args }))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return { ok: false, error: sim.error };
  return { ok: true, value: sim.result?.retval ? scValToNative(sim.result.retval) : undefined };
}

/**
 * Simula sem enviar. É o que a UI usa para avisar "esta operação seria
 * recusada" antes de gastar transação — e o que o teste da fase 8 verifica.
 */
export async function simulate(contract, fn, args, signer) {
  const source = await server.getAccount(signer.publicKey());
  const tx = new TransactionBuilder(source, { fee: "3000000", networkPassphrase: PASS })
    .addOperation(Operation.invokeContractFunction({ contract, function: fn, args }))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return { wouldSucceed: false, error: sim.error };
  return { wouldSucceed: true };
}

/** Verdadeiro se o erro carrega este código de contrato. */
export function hasError(result, code) {
  return String(result?.error ?? "").includes(`#${code}`) ||
    String(result?.error ?? "").includes(`, ${code})`) ||
    String(result?.error ?? "").includes(`Error(Contract, #${code})`);
}

/** Eventos de uma transação, decodificados. */
export async function eventsOf(hash) {
  const tx = await server.getTransaction(hash);
  const meta = tx.resultMetaXdr;
  const events = meta?.v3?.()?.sorobanMeta?.()?.events?.() ?? [];
  return events.map((e) => ({
    contract: Address.fromScAddress(e.contractId()).toString?.() ?? null,
    topics: e.body().v0().topics().map((t) => {
      try { return scValToNative(t); } catch { return "?"; }
    }),
    data: (() => {
      try { return scValToNative(e.body().v0().data()); } catch { return "?"; }
    })(),
  }));
}

export { xdr, Address, Keypair };
