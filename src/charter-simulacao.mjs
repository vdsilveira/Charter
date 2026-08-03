/**
 * Charter Simulation — o agente pagando por x402, passo a passo.
 *
 * Existe para ser **assistida**: cada etapa pede confirmação e mostra o que
 * aconteceu antes de seguir. Um script que faz tudo de uma vez esconde
 * justamente o que interessa mostrar — que o agente assina, que a assinatura é
 * uma autorização e não uma ordem, e que quem paga a taxa é outra carteira.
 *
 * O que cada papel tem:
 *
 *   agente (Neo / Morpheus)  chave que **autoriza**. Sem XLM, sem conta na rede.
 *   patrocinador (fundador)  paga a taxa. Nenhum poder sobre o tesouro.
 *   conta corporativa        de onde o valor sai, se a procuração permitir.
 *
 * Uso:  node src/charter-simulacao.mjs
 * Chaves: `.env.simulacao` (não versionado). Veja `.env.simulacao.example`.
 */
import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import {
  Account, Address, Contract, Keypair, Networks, Operation, TransactionBuilder,
  nativeToScVal, rpc, scValToNative, xdr,
} from "@stellar/stellar-sdk";
import { createCharterSigner } from "./charter-signer.mjs";

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

const raiz = new URL("..", import.meta.url);
for (const arquivo of [".env.simulacao", ".env.demo"]) {
  try {
    for (const linha of readFileSync(new URL(arquivo, raiz), "utf8").split("\n")) {
      const i = linha.indexOf("=");
      if (i > 0 && !linha.trim().startsWith("#")) {
        process.env[linha.slice(0, i).trim()] ??= linha.slice(i + 1).trim();
      }
    }
  } catch {
    /* ausente é normal: em container as chaves vêm do ambiente */
  }
}

const PASS = Networks.TESTNET;
const server = new rpc.Server(process.env.STELLAR_RPC ?? "https://soroban-testnet.stellar.org");
const dep = JSON.parse(readFileSync(new URL("deployments/testnet.json", raiz), "utf8"));

const ORG = process.env.SIM_ORG ?? "Matrix";
const RECURSO = process.env.RESOURCE_URL ?? "http://localhost:3001/market-data";
const FACILITADOR = process.env.FACILITATOR_URL ?? "https://channels.openzeppelin.com/x402/testnet";
const VERIFICADOR = process.env.CHARTER_ED25519_VERIFIER ?? dep.accounts.ed25519Verifier;

/**
 * A chave do agente, procurada por nome.
 *
 * `AGENT_NEO_SECRET` para um agente chamado `Neo`. Deixar a lista vir da
 * organização, e não de uma constante aqui, evita a simulação divergir do que
 * está na cadeia — e é o que permite rodá-la em qualquer organização.
 */
const chaveDe = (nome) => process.env[`AGENT_${nome.toUpperCase()}_SECRET`];

// ---------------------------------------------------------------------------
// Apresentação
// ---------------------------------------------------------------------------

const cor = (c, t) => `\x1b[${c}m${t}\x1b[0m`;
const forte = (t) => cor("1", t);
const fraco = (t) => cor("2", t);
const ok = (t) => cor("32", t);
const alerta = (t) => cor("33", t);
const erro = (t) => cor("31", t);

function titulo() {
  const linha = "═".repeat(58);
  console.log();
  console.log(forte(`╔${linha}╗`));
  console.log(forte("║") + forte("            C H A R T E R   S I M U L A T I O N           ") + forte("║"));
  console.log(forte("║") + fraco("       procuração programável · x402 · Stellar testnet     ") + forte("║"));
  console.log(forte(`╚${linha}╝`));
  console.log();
}

function passo(n, texto) {
  console.log();
  console.log(forte(`  ${n}. ${texto}`));
  console.log(fraco("  " + "─".repeat(56)));
}

const item = (k, v) => console.log(`     ${fraco(k.padEnd(22))} ${v}`);

// ---------------------------------------------------------------------------
// Leituras da cadeia
// ---------------------------------------------------------------------------

const leitor = new Account(Keypair.random().publicKey(), "0");

async function ler(contrato, fn, ...args) {
  const tx = new TransactionBuilder(leitor, { fee: "1000000", networkPassphrase: PASS })
    .addOperation(new Contract(contrato).call(fn, ...args))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error.split("\n")[0]);
  return scValToNative(sim.result.retval);
}

/**
 * O id da procuração do agente, descoberto pelo nome.
 *
 * Não é configuração: a regra guarda o rótulo, e depender de um número no
 * `.env` seria convidar o erro silencioso de assinar sob a procuração errada —
 * a regra 0 é sempre a do administrador.
 */
async function regraDo(conta, rotulo) {
  for (let id = 0; id < 32; id++) {
    try {
      const r = await ler(conta, "get_context_rule", xdr.ScVal.scvU32(id));
      if (r?.name === rotulo) return id;
    } catch {
      /* id inexistente: segue */
    }
  }
  throw new Error(`nenhuma procuração chamada "${rotulo}" na conta ${conta}`);
}

// ---------------------------------------------------------------------------
// Passos
// ---------------------------------------------------------------------------

/** GET no recurso protegido. A resposta 402 traz o que o vendedor exige. */
async function pedirRecurso() {
  const r = await fetch(RECURSO, { headers: { accept: "application/json" } });
  const corpo = await r.text();

  let json;
  try {
    json = JSON.parse(corpo);
  } catch {
    json = null;
  }

  return { status: r.status, cabecalho: r.headers.get("payment-required"), json, cru: corpo };
}

/**
 * Exigência de ensaio, para quando não há vendedor no ar.
 *
 * Mesma forma que o x402 usa, mas montada aqui — e o roteiro diz isso em voz
 * alta. Serve para exercitar o que não depende do x402: a assinatura do agente,
 * a decisão da procuração e o patrocínio da taxa.
 */
function exigenciaLocal() {
  return {
    scheme: "exact",
    network: "stellar:testnet",
    asset: process.env.CHARTER_TARGET ?? dep.confidential.underlying,
    payTo: process.env.SIM_DESTINO ?? JSON.parse(
      readFileSync(new URL("deployments/identity-testnet.json", raiz), "utf8"),
    ).supplier,
    maxAmountRequired: process.env.SIM_VALOR ?? "1000000",
    description: "ensaio local — nenhum vendedor envolvido",
  };
}

/** O primeiro meio de pagamento aceito, na forma do x402. */
function exigencia(json) {
  const aceitos = json?.accepts ?? json?.paymentRequirements ?? [];
  return Array.isArray(aceitos) ? aceitos[0] : aceitos;
}

/** A transferência que o vendedor está pedindo. */
function operacaoDePagamento({ ativo, de, para, valor, auth }) {
  return Operation.invokeContractFunction({
    contract: ativo,
    function: "transfer",
    args: [
      new Address(de).toScVal(),
      new Address(para).toScVal(),
      nativeToScVal(BigInt(valor), { type: "i128" }),
    ],
    ...(auth ? { auth } : {}),
  });
}

/**
 * O agente assina a autorização — e nada além dela.
 *
 * A simulação prévia diz **quais** autorizações a rede vai exigir; o agente não
 * adivinha, assina as que foram pedidas. A fonte é uma conta sintética, porque
 * ele não precisa existir na rede para isso.
 */
async function assinarComAgente({ agente, conta, ruleId, ativo, para, valor }) {
  const sonda = new TransactionBuilder(new Account(Keypair.random().publicKey(), "0"), {
    fee: "3000000",
    networkPassphrase: PASS,
  })
    .addOperation(operacaoDePagamento({ ativo, de: conta, para, valor }))
    .setTimeout(60)
    .build();

  const prevista = await server.simulateTransaction(sonda);
  if (rpc.Api.isSimulationError(prevista)) {
    throw new Error(prevista.error.split("\n")[0]);
  }

  const signer = createCharterSigner({
    account: conta,
    agentSecret: agente.segredo,
    verifier: VERIFICADOR,
    contextRuleId: ruleId,
    networkPassphrase: PASS,
    rpc: server,
  });

  const ultimo = (await server.getLatestLedger()).sequence;
  const entradas = [];
  for (const e of prevista.result?.auth ?? []) {
    const { signedAuthEntry } = await signer.signAuthEntry(e.toXDR("base64"), {
      validUntilLedgerSeq: ultimo + 120,
    });
    entradas.push(signedAuthEntry);
  }
  return entradas;
}

/**
 * Confere, com a autorização em mãos, o que a rede realmente faria.
 *
 * A sonda anterior roda **sem** autorização, e a policy só executa quando as
 * auth entries estão presentes — ela é otimista por construção. Sem esta
 * segunda leitura, uma recusa da procuração só apareceria depois de o
 * patrocinador pagar a taxa.
 */
async function conferir({ conta, ativo, para, valor, entradas }) {
  const tx = new TransactionBuilder(new Account(Keypair.random().publicKey(), "0"), {
    fee: "3000000",
    networkPassphrase: PASS,
  })
    .addOperation(
      operacaoDePagamento({
        ativo,
        de: conta,
        para,
        valor,
        auth: entradas.map((e) => xdr.SorobanAuthorizationEntry.fromXDR(e, "base64")),
      }),
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationError(sim)) return null;

  const codigo = /Error\(Contract, #(\d+)\)/.exec(sim.error)?.[1];
  return (
    {
      4002: "função fora do escopo da procuração (4002)",
      4003: "contraparte sem claim KYB acima do limiar (4003)",
      4006: "passaria do teto acumulado da procuração (4006)",
      3221: "acima da cota do período (3221)",
    }[codigo] ?? sim.error.split("\n")[0]
  );
}

/** O patrocinador submete e paga a taxa. */
async function patrocinar({ conta, ativo, para, valor, entradas }) {
  const patrocinador = Keypair.fromSecret(process.env.SPONSOR_SECRET);

  const tx = new TransactionBuilder(await server.getAccount(patrocinador.publicKey()), {
    fee: "5000000",
    networkPassphrase: PASS,
  })
    .addOperation(
      operacaoDePagamento({
        ativo,
        de: conta,
        para,
        valor,
        auth: entradas.map((e) => xdr.SorobanAuthorizationEntry.fromXDR(e, "base64")),
      }),
    )
    .setTimeout(120)
    .build();

  const preparada = await server.prepareTransaction(tx);
  preparada.sign(patrocinador);

  const enviada = await server.sendTransaction(preparada);
  if (enviada.status === "ERROR") throw new Error(JSON.stringify(enviada.errorResult ?? enviada));

  let res = await server.getTransaction(enviada.hash);
  for (let i = 0; i < 40 && res.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await server.getTransaction(enviada.hash);
  }
  if (res.status !== "SUCCESS") throw new Error(`transação ${enviada.hash}: ${res.status}`);

  return { hash: enviada.hash, patrocinador: patrocinador.publicKey() };
}

/** Reapresenta o recurso com a prova de pagamento. */
async function liquidar({ hash, exige }) {
  const carga = {
    x402Version: 1,
    scheme: exige?.scheme ?? "exact",
    network: exige?.network ?? "stellar:testnet",
    payload: { transactionHash: hash },
  };

  const r = await fetch(RECURSO, {
    headers: {
      accept: "application/json",
      "payment-signature": Buffer.from(JSON.stringify(carga)).toString("base64"),
    },
  });

  return { status: r.status, corpo: await r.text() };
}

// ---------------------------------------------------------------------------
// Roteiro
// ---------------------------------------------------------------------------

const rl = createInterface({ input: process.stdin, output: process.stdout });

// Entrada encerrada — Ctrl-D, ou alimentada por pipe — precisa terminar limpo.
// Sair no evento `close` seria pior: mataria o processo no meio de uma chamada
// de rede, e o passo apareceria como se nunca tivesse rodado.
let encerrado = false;
rl.on("close", () => {
  encerrado = true;
});

function perguntar(texto) {
  if (encerrado) return Promise.resolve("");

  // Corrida com o fim da entrada: `question` não rejeita quando o stdin fecha,
  // e sem isto o processo termina com um `await` pendurado para sempre.
  return Promise.race([
    rl.question(texto).catch(() => ""),
    new Promise((resolve) => rl.once("close", () => resolve(""))),
  ]);
}

const sim = async (p) => /^s|^y/i.test((await perguntar(`     ${p} ${fraco("(y/N)")} `)).trim());

async function rodada() {
  // 1 ────────────────────────────────────────────────────────────────────────
  passo(1, "Escolher agente");

  const info = await ler(process.env.CHARTER_REGISTRY, "org_of", xdr.ScVal.scvSymbol(ORG));
  const agentes = info.agents.map((nome) => ({ nome: String(nome), segredo: chaveDe(String(nome)) }));

  agentes.forEach((a, i) => {
    const estado = a.segredo ? ok("chave carregada") : erro(`falta AGENT_${a.nome.toUpperCase()}_SECRET`);
    console.log(`     [${i + 1}] ${a.nome.padEnd(12)} ${estado}`);
  });

  const escolha = Number((await perguntar("\n     agente: ")).trim());
  const agente = agentes[escolha - 1];
  if (!agente) return console.log(erro("\n     escolha inválida."));
  if (!agente.segredo) {
    return console.log(erro("\n     sem a chave dele, não há o que assinar."));
  }

  const ruleId = await regraDo(info.account, agente.nome);

  item("organização", ORG);
  item("conta corporativa", info.account);
  item("procuração", `regra ${ruleId} — ${agente.nome}`);

  // 2 ────────────────────────────────────────────────────────────────────────
  passo(2, "Executar x402 — pedir o recurso e receber a cobrança");
  if (!(await sim("chamar o vendedor?"))) return;

  let resposta;
  try {
    resposta = await pedirRecurso();
  } catch (e) {
    console.log(erro(`     não deu para falar com ${RECURSO}`));
    console.log(fraco(`     ${e.message}`));
    console.log(alerta("     suba o vendedor com: pnpm x402:server (exige OZ_API_KEY)"));
    console.log();

    // O x402 é a embalagem; a tese está nos passos 3 e 4 — o agente assina, o
    // patrocinador paga, a procuração decide. Ensaiar essa parte sem vendedor é
    // legítimo desde que fique dito: a exigência abaixo é **nossa**, não veio
    // de ninguém cobrando.
    if (!(await sim("ensaiar com uma exigência local? (nada vem do vendedor)"))) return;
    resposta = { status: 402, json: { accepts: [exigenciaLocal()] }, cru: "" };
    console.log(alerta("     ENSAIO — exigência montada aqui, sem vendedor no circuito"));
  }

  console.log(`     HTTP ${resposta.status === 402 ? alerta("402 Payment Required") : resposta.status}`);
  const exige = exigencia(resposta.json);
  if (resposta.status !== 402 || !exige) {
    console.log(erro("     o vendedor não pediu pagamento; nada a assinar."));
    console.log(fraco(`     ${resposta.cru.slice(0, 300)}`));
    return;
  }

  console.log();
  console.log(fraco("     payload de payment-required:"));
  console.log(
    fraco(
      JSON.stringify(exige, null, 2)
        .split("\n")
        .map((l) => `     ${l}`)
        .join("\n"),
    ),
  );

  const ativo = exige.asset ?? process.env.USDC_TESTNET;
  const para = exige.payTo ?? exige.recipient;
  const valor = String(exige.maxAmountRequired ?? exige.amount ?? "0");

  // 3 ────────────────────────────────────────────────────────────────────────
  passo(3, `Assinar com a carteira de ${agente.nome}`);
  item("ativo", ativo);
  item("destinatário", para);
  item("valor", valor);

  if (!(await sim("assinar?"))) {
    console.log(fraco("\n     nada assinado. voltando ao início."));
    return;
  }

  let entradas;
  try {
    entradas = await assinarComAgente({ agente, conta: info.account, ruleId, ativo, para, valor });
  } catch (e) {
    console.log(erro(`     a rede recusaria antes da assinatura: ${e.message}`));
    return;
  }

  console.log(ok(`     ${entradas.length} autorização assinada sob a regra ${ruleId}`));
  console.log(fraco(`     ${entradas[0].slice(0, 72)}…`));

  const motivo = await conferir({ conta: info.account, ativo, para, valor, entradas });
  if (motivo) {
    console.log(erro(`     a procuração recusa: ${motivo}`));
    console.log(fraco("     nada foi enviado — o patrocinador não paga por transação que reverte."));
    return;
  }
  console.log(ok("     conferido: a procuração permite esta operação"));

  // 4 ────────────────────────────────────────────────────────────────────────
  passo(4, "Enviar ao patrocinador — o fundador paga a taxa");
  if (!(await sim("enviar?"))) return;

  if (!process.env.SPONSOR_SECRET) {
    console.log(erro("     sem SPONSOR_SECRET: é a chave de quem paga a taxa."));
    return;
  }

  let liquidado;
  try {
    liquidado = await patrocinar({ conta: info.account, ativo, para, valor, entradas });
  } catch (e) {
    console.log(erro(`     o patrocinador não conseguiu submeter: ${e.message.slice(0, 160)}`));
    return;
  }

  console.log(ok("     liquidado on-chain"));
  item("hash", liquidado.hash);
  item("taxa paga por", liquidado.patrocinador);
  item("valor saiu de", info.account);
  console.log(fraco(`     https://stellar.expert/explorer/testnet/tx/${liquidado.hash}`));

  // 5 ────────────────────────────────────────────────────────────────────────
  passo(5, "Enviar ao facilitador — apresentar a prova ao vendedor");
  if (!(await sim("enviar?"))) return;

  try {
    const fim = await liquidar({ hash: liquidado.hash, exige });
    console.log(`     HTTP ${fim.status === 200 ? ok("200 OK") : alerta(fim.status)}`);
    console.log(fraco(`     ${fim.corpo.slice(0, 400)}`));
  } catch (e) {
    console.log(alerta("     sem vendedor no ar, não há a quem apresentar a prova."));
    console.log(fraco(`     ${e.message}`));
    console.log(fraco(`     o pagamento está liquidado na rede: ${liquidado.hash}`));
  }

  // 6 ────────────────────────────────────────────────────────────────────────
  passo(6, "Concluído");
  console.log(ok(`     ${agente.nome} pagou pelo recurso sem nunca possuir XLM.`));
  console.log(fraco("     a procuração decidiu, o patrocinador pagou, a rede registrou."));
}

titulo();
console.log(fraco(`  vendedor    ${RECURSO}`));
console.log(fraco(`  facilitador ${FACILITADOR}`));
console.log(fraco(`  registro    ${process.env.CHARTER_REGISTRY ?? "(sem CHARTER_REGISTRY)"}`));

try {
  for (;;) {
    await rodada();
    if (encerrado) break;
    console.log();
    if (!(await sim("outra rodada?"))) break;
  }
} finally {
  rl.close();
  console.log(fraco("\n  fim.\n"));
}
