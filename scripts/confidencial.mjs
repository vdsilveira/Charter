/**
 * Operações confidenciais da organização, para a tela chamar.
 *
 * Roda **fora** do processo do Next, de propósito. O provador carrega wasm do
 * disco e usa worker threads; o bundler do Next transforma o `.wasm` em URL
 * estática e o Node tenta buscá-la como HTTP, ou simplesmente não a copia.
 * Foram duas rodadas de briga com o empacotador antes de aceitar o óbvio: um
 * processo separado resolve as duas coisas e ainda garante que os workers
 * morram junto com ele.
 *
 * Uso:
 *   node scripts/confidencial.mjs saldo
 *   node scripts/confidencial.mjs pagar <destinatário G…> <valor>
 *
 * Sempre imprime **uma linha JSON** na saída padrão. Erro vai como
 * `{"error": "..."}` com código de saída 1 — a tela mostra o texto, então ele
 * precisa dizer algo a quem opera.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import {
  ChainClient, CircuitProver, FR_MODULUS, MemoryStore, StateEngine, addressToField,
  buildTransferWitness, deriveKeys, keypairSigner, submitTransfer,
} from "@ctd/sdk";
import { loadCircuit } from "@ctd/sdk/proving/artifacts";

const raizProjeto = new URL("..", import.meta.url);
for (const arquivo of [".env.demo", ".env.simulacao"]) {
  try {
    for (const linha of readFileSync(new URL(arquivo, raizProjeto), "utf8").split("\n")) {
      const i = linha.indexOf("=");
      if (i > 0 && !linha.trim().startsWith("#")) {
        let v = linha.slice(i + 1).trim();
        if (v.length > 1 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
        process.env[linha.slice(0, i).trim()] ??= v;
      }
    }
  } catch {
    /* ausente é normal */
  }
}

const PASS = Networks.TESTNET;
const AUDITOR_ID = 0;
const dep = JSON.parse(readFileSync(new URL("deployments/testnet.json", raizProjeto), "utf8"));
const TOKEN = dep.charter.gatedConfidentialToken;

const sair = (obj, codigo = 0) => {
  process.stdout.write(JSON.stringify(obj) + "\n");
  process.exit(codigo);
};

/**
 * Raiz determinística das chaves confidenciais.
 *
 * O opening `(v, r)` de um saldo vive só no cliente. Raiz aleatória entre
 * execuções torna o saldo anterior inacessível, e o contrato não pode ajudar
 * porque nunca soube o valor — duas contas foram queimadas assim.
 */
function raiz(segredo) {
  const d = createHash("sha256").update(`charter:${segredo}:${TOKEN}`).digest("hex");
  return BigInt(`0x${d}`) % FR_MODULUS;
}

const client = new ChainClient({
  rpcUrl: process.env.STELLAR_RPC ?? "https://soroban-testnet.stellar.org",
  networkPassphrase: PASS,
  contracts: { token: TOKEN, verifier: dep.confidential.verifier, auditor: dep.confidential.auditor },
});

const segredo = process.env.CONFIDENTIAL_TREASURY_SECRET;
if (!segredo) sair({ error: "CONFIDENTIAL_TREASURY_SECRET is not set." }, 1);

const kp = Keypair.fromSecret(segredo);
const keys = deriveKeys(raiz(segredo), addressToField(TOKEN));
const deLedger = Math.max((await client.latestLedger()) - 100_000, 1);
const engine = new StateEngine({
  client,
  store: new MemoryStore(),
  keys,
  address: kp.publicKey(),
  fromLedger: deLedger,
});

const [comando, para, valor] = process.argv.slice(2);

if (comando === "saldo") {
  const estado = await engine.sync();
  sair({ gastavel: String(estado.spendable.v), tesouro: kp.publicKey(), token: TOKEN });
}

if (comando !== "pagar") sair({ error: `unknown command: ${comando}` }, 1);
if (!/^\d+$/.test(valor ?? "") || BigInt(valor) <= 0n) {
  sair({ error: "Amount must be a positive integer." }, 1);
}

const estado = await engine.sync();
if (estado.spendable.v < BigInt(valor)) {
  sair(
    { error: `Confidential treasury holds ${estado.spendable.v}, not enough for ${valor}.` },
    1,
  );
}

// A chave de visão do destinatário vem do registro dele na cadeia — é ela que
// permite a ele, e só a ele, decifrar o valor. Ler daqui é o que abre a folha a
// qualquer conta registrada, e não só àquelas cuja chave este processo conhece.
const conta = await client.confidentialBalance(para);
if (!conta) {
  sair(
    {
      error:
        "The recipient has no confidential account. Only they can open it — the registration is signed by their own key.",
    },
    1,
  );
}

const kAud = await client.auditorKey(AUDITOR_ID);
const atual = await engine.current();
const w = buildTransferWitness({
  keys,
  v: atual.spendable.v,
  r: atual.spendable.r,
  amount: BigInt(valor),
  pvkB: conta.viewingPublicKey,
  // Um auditor só, nos dois canais: a organização designou um, e é ele que abre
  // tanto o lado de quem paga quanto o de quem recebe.
  kAudR: kAud,
  kAudS: kAud,
});

const prover = new CircuitProver(loadCircuit("transfer"));
try {
  const { proof } = await prover.prove(w.inputs);
  const tx = await submitTransfer(client, keypairSigner(segredo, PASS), kp.publicKey(), para, w, proof);
  sair({ hash: tx.hash, para, valor });
} catch (e) {
  sair({ error: String(e?.message ?? e).split("\n")[0] }, 1);
} finally {
  // Os worker threads do UltraHonk seguram o event loop. Sem isto o processo
  // não termina, e o sintoma é uma requisição que nunca responde.
  await prover.destroy?.();
}
