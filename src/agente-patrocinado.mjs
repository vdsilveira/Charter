/**
 * O agente: assina a autorização e manda para o patrocinador.
 *
 * Este processo carrega a chave do agente e **nada mais**. Não tem XLM, não
 * precisa de conta financiada na rede, não paga taxa. O que ele produz é uma
 * `SorobanAuthorizationEntry` assinada — a prova de que o agente autorizou
 * aquela operação exata, e só aquela.
 *
 * O que atravessa a rede até o patrocinador é isso mais a intenção em campos
 * tipados (organização, destinatário, valor). O patrocinador remonta a operação
 * a partir dos campos; se remontar diferente, a assinatura não fecha e a rede
 * recusa. Nenhum dos dois lados precisa confiar no outro.
 *
 * Uso:
 *   AGENT_SECRET=S… node src/agente-patrocinado.mjs <org> <ruleId> <destinatário> <valor>
 *
 * A chave do agente vive só aqui. O patrocinador nunca a vê, e o servidor da
 * aplicação também não.
 */
import { readFileSync } from "node:fs";
import {
  Account, Address, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, rpc, xdr,
} from "@stellar/stellar-sdk";
import { createCharterSigner } from "./charter-signer.mjs";

const raiz = new URL("..", import.meta.url);
for (const arquivo of [".env.demo"]) {
  try {
    for (const linha of readFileSync(new URL(arquivo, raiz), "utf8").split("\n")) {
      const i = linha.indexOf("=");
      // Aspas em volta são convenção de shell, não parte do valor.
      if (i > 0) {
        const v = linha.slice(i + 1).trim();
        const nu = v.length > 1 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'") ? v.slice(1, -1) : v;
        process.env[linha.slice(0, i).trim()] ??= nu;
      }
    }
  } catch {
    /* em container as chaves vêm do ambiente */
  }
}

/** Códigos que o agente pode encontrar, em linguagem de operador. */
const MOTIVOS = {
  4002: "esta função está fora do escopo do agente (4002)",
  4003: "a contraparte não está verificada — acima do limiar exige claim KYB (4003)",
  3221: "valor acima da cota do agente no período (3221)",
  3223: "a política não autoriza este tipo de operação (3223)",
  4006: "operação passaria do teto acumulado da procuração (4006)",
};

const [org, ruleId, destinatario, valor] = process.argv.slice(2);
if (!org || !ruleId || !destinatario || !valor) {
  console.error("uso: agente-patrocinado.mjs <org> <ruleId> <destinatário> <valor>");
  process.exit(1);
}

const RPC = process.env.STELLAR_RPC ?? "https://soroban-testnet.stellar.org";
const PATROCINADOR = process.env.SPONSOR_URL ?? "http://localhost:3000/api/patrocinio";
const PASS = Networks.TESTNET;
const server = new rpc.Server(RPC);

const dep = JSON.parse(readFileSync(new URL("deployments/testnet.json", raiz), "utf8"));
const ALVO = process.env.CHARTER_TARGET ?? dep.confidential.underlying;

/** A conta corporativa da organização, lida do registro. */
async function contaDaOrg(nome) {
  const leitor = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(leitor, { fee: "1000000", networkPassphrase: PASS })
    .addOperation(
      Operation.invokeContractFunction({
        contract: process.env.CHARTER_REGISTRY,
        function: "org_of",
        args: [xdr.ScVal.scvSymbol(nome)],
      }),
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`org_of: ${sim.error}`);
  const info = (await import("@stellar/stellar-sdk")).scValToNative(sim.result.retval);
  return String(info.account);
}

/** A operação que o agente quer autorizar. O patrocinador remonta a mesma. */
function operacao(contaOrg, auth) {
  return Operation.invokeContractFunction({
    contract: ALVO,
    function: "transfer",
    args: [
      new Address(contaOrg).toScVal(),
      new Address(destinatario).toScVal(),
      nativeToScVal(BigInt(valor), { type: "i128" }),
    ],
    ...(auth ? { auth } : {}),
  });
}

const contaOrg = await contaDaOrg(org);
console.log(`agente de ${org} → conta ${contaOrg}`);

// A simulação diz **quais** autorizações a rede vai exigir. O agente não
// adivinha: ele assina exatamente as que a rede pediu.
//
// A fonte aqui é uma conta sintética: só serve para simular, e é o que permite
// ao agente descobrir isso sem ter conta na rede.
const sonda = new TransactionBuilder(new Account(Keypair.random().publicKey(), "0"), {
  fee: "3000000",
  networkPassphrase: PASS,
})
  .addOperation(operacao(contaOrg))
  .setTimeout(60)
  .build();

const prevista = await server.simulateTransaction(sonda);
if (rpc.Api.isSimulationError(prevista)) {
  console.error("a rede recusaria antes mesmo da assinatura:", prevista.error.split("\n")[0]);
  process.exit(2);
}

const signer = createCharterSigner({
  account: contaOrg,
  agentSecret: process.env.AGENT_SECRET,
  verifier: process.env.CHARTER_ED25519_VERIFIER ?? dep.accounts.ed25519Verifier,
  contextRuleId: Number(ruleId),
  networkPassphrase: PASS,
  rpc: server,
});

const ultimo = (await server.getLatestLedger()).sequence;
const entradas = [];
for (const e of prevista.result?.auth ?? []) {
  const { signedAuthEntry } = await signer.signAuthEntry(e.toXDR("base64"), {
    // Janela curta: a autorização vale para esta operação e por pouco tempo.
    validUntilLedgerSeq: ultimo + 120,
  });
  entradas.push(signedAuthEntry);
}
console.log(`assinadas ${entradas.length} autorizações sob a regra ${ruleId}`);

// Conferência antes de incomodar o patrocinador.
//
// A sonda acima roda **sem** autorização, e a policy só executa quando as auth
// entries estão presentes — por isso ela é otimista por construção. Simular de
// novo, agora com o que foi assinado, é o que revela a recusa de verdade e com
// o código do contrato. Sem isto o agente manda uma transação destinada a
// reverter, e o patrocinador paga para descobrir.
const conferencia = new TransactionBuilder(new Account(Keypair.random().publicKey(), "0"), {
  fee: "3000000",
  networkPassphrase: PASS,
})
  .addOperation(
    operacao(
      contaOrg,
      entradas.map((e) => xdr.SorobanAuthorizationEntry.fromXDR(e, "base64")),
    ),
  )
  .setTimeout(60)
  .build();

const veredito = await server.simulateTransaction(conferencia);
if (rpc.Api.isSimulationError(veredito)) {
  const codigo = /Error\(Contract, #(\d+)\)/.exec(veredito.error)?.[1];
  console.error(`a rede recusaria: ${MOTIVOS[codigo] ?? veredito.error.split("\n")[0]}`);
  if (!codigo && process.env.DEBUG_RECUSA) console.error(veredito.error.slice(0, 1200));
  process.exit(2);
}
console.log("conferido: a rede aprovaria esta operação");

// Daqui para a frente o agente não tem mais nada a fazer: quem paga é o outro.
const r = await fetch(PATROCINADOR, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ org, destinatario, valor, entradas }),
});

const corpo = await r.json();
if (!r.ok) {
  console.error("patrocinador recusou:", corpo?.error?.split("\n")[0] ?? corpo);
  process.exit(3);
}

console.log(`liquidado — ${corpo.hash}`);
console.log(`  taxa paga por ${corpo.patrocinador}`);
console.log(`  valor saiu de ${corpo.contaOrg}`);
