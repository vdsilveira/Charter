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

/** Tira aspas em volta, como o shell faz. */
const semAspas = (v) =>
  v.length > 1 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'") ? v.slice(1, -1) : v;

const raiz = new URL("..", import.meta.url);
for (const arquivo of [".env.simulacao", ".env.demo"]) {
  try {
    for (const linha of readFileSync(new URL(arquivo, raiz), "utf8").split("\n")) {
      const i = linha.indexOf("=");
      if (i > 0 && !linha.trim().startsWith("#")) {
        // Aspas em volta são convenção de shell, não parte do valor: o `source`
        // do bash as remove, e mantê-las aqui faria a mesma chave valer uma
        // coisa por shell e outra por código.
        process.env[linha.slice(0, i).trim()] ??= semAspas(linha.slice(i + 1).trim());
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
  console.log(forte("║") + fraco("        programmable power of attorney · x402 · testnet    ") + forte("║"));
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
  throw new Error(`no power of attorney named "${rotulo}" in account ${conta}`);
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

  // O x402 v2 manda as exigências no cabeçalho `PAYMENT-REQUIRED`, em base64.
  // Ler só o corpo devolvia `{}` e fazia parecer que o vendedor não cobrava.
  const cabecalho = r.headers.get("payment-required") ?? r.headers.get("PAYMENT-REQUIRED");
  let doCabecalho = null;
  if (cabecalho) {
    try {
      doCabecalho = JSON.parse(Buffer.from(cabecalho, "base64").toString("utf8"));
    } catch {
      /* cabeçalho ilegível: o corpo ainda pode servir */
    }
  }

  return { status: r.status, json: doCabecalho ?? json, cru: corpo };
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
    description: "local rehearsal — no seller involved",
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
async function assinarComAgente({ agente, conta, ruleId, ativo, para, valor, maxTimeoutSeconds }) {
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
  // A validade precisa caber em `maxTimeoutSeconds`: o facilitador recusa
  // autorização com prazo longo demais (`auth_expiration_too_far`).
  const janela = Math.ceil((maxTimeoutSeconds ?? 300) / 5);
  for (const e of prevista.result?.auth ?? []) {
    const { signedAuthEntry } = await signer.signAuthEntry(e.toXDR("base64"), {
      validUntilLedgerSeq: ultimo + janela,
    });
    entradas.push(signedAuthEntry);
  }
  return entradas;
}

/**
 * A transação que o x402 espera como prova de pagamento.
 *
 * O payload do esquema `exact` é a **transação inteira**, não um hash: o
 * facilitador a submete e patrocina a taxa (`areFeesSponsored: true`). Por isso
 * ele e o nosso patrocinador são rotas alternativas — quem liquidar primeiro
 * consome a autorização.
 */
async function transacaoParaX402({ conta, ativo, para, valor, entradas }) {
  // Taxa base mínima: quem paga é o facilitador, e ele recusa acima do teto
  // dele (`fee_exceeds_maximum`). O preparo soma o custo de recurso por cima.
  const tx = new TransactionBuilder(new Account(Keypair.random().publicKey(), "0"), {
    fee: "100",
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
    .setTimeout(300)
    .build();

  return (await server.prepareTransaction(tx)).toXDR();
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
      4002: "function outside the agent's scope (4002)",
      4003: "counterparty has no KYB claim, and the amount is above the threshold (4003)",
      4006: "would pass the lifetime cap of the power of attorney (4006)",
      3221: "above the agent's quota for the period (3221)",
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

/** Reapresenta o recurso com a prova de pagamento, no formato do x402. */
async function liquidar({ transacao, exige }) {
  // `accepted` carrega a exigência escolhida — sem ele o facilitador responde
  // `invalid_exact_payload_malformed`.
  const carga = { x402Version: 2, accepted: exige, payload: { transaction: transacao } };

  const r = await fetch(RECURSO, {
    headers: {
      accept: "application/json",
      "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(carga)).toString("base64"),
    },
  });

  return { status: r.status, corpo: await r.text(), resposta: r.headers.get("PAYMENT-RESPONSE") };
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
  passo(1, "Choose an agent");

  const info = await ler(process.env.CHARTER_REGISTRY, "org_of", xdr.ScVal.scvSymbol(ORG));
  const agentes = info.agents.map((nome) => ({ nome: String(nome), segredo: chaveDe(String(nome)) }));

  agentes.forEach((a, i) => {
    const estado = a.segredo ? ok("key loaded") : erro(`missing AGENT_${a.nome.toUpperCase()}_SECRET`);
    console.log(`     [${i + 1}] ${a.nome.padEnd(12)} ${estado}`);
  });

  const escolha = Number((await perguntar("\n     agent: ")).trim());
  const agente = agentes[escolha - 1];
  if (!agente) return console.log(erro("\n     invalid choice."));
  if (!agente.segredo) {
    return console.log(erro("\n     without its key there is nothing to sign."));
  }

  const ruleId = await regraDo(info.account, agente.nome);

  item("organization", ORG);
  item("corporate account", info.account);
  item("power of attorney", `rule ${ruleId} — ${agente.nome}`);

  // 2 ────────────────────────────────────────────────────────────────────────
  passo(2, "Run x402 — request the resource and get charged");
  if (!(await sim("call the seller?"))) return;

  let resposta;
  try {
    resposta = await pedirRecurso();
  } catch (e) {
    console.log(erro(`     could not reach ${RECURSO}`));
    console.log(fraco(`     ${e.message}`));
    console.log(alerta("     start it with: pnpm x402:server (needs OZ_API_KEY)"));
    console.log();

    // O x402 é a embalagem; a tese está nos passos 3 e 4 — o agente assina, o
    // patrocinador paga, a procuração decide. Ensaiar essa parte sem vendedor é
    // legítimo desde que fique dito: a exigência abaixo é **nossa**, não veio
    // de ninguém cobrando.
    if (!(await sim("rehearse with a local requirement? (nothing comes from a seller)"))) return;
    resposta = { status: 402, json: { accepts: [exigenciaLocal()] }, cru: "" };
    console.log(alerta("     REHEARSAL — requirement built here, no seller involved"));
  }

  console.log(`     HTTP ${resposta.status === 402 ? alerta("402 Payment Required") : resposta.status}`);
  const exige = exigencia(resposta.json);
  if (resposta.status !== 402 || !exige) {
    console.log(erro("     the seller did not ask for payment; nothing to sign."));
    console.log(fraco(`     ${resposta.cru.slice(0, 300)}`));
    return;
  }

  console.log();
  console.log(fraco("     payment-required payload:"));
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
  passo(3, `Sign with ${agente.nome}\u2019s wallet`);
  item("asset", ativo);
  item("recipient", para);
  item("amount", valor);

  if (!(await sim("sign?"))) {
    console.log(fraco("\n     nothing signed. back to the start."));
    return;
  }

  let entradas;
  try {
    entradas = await assinarComAgente({
      agente,
      conta: info.account,
      ruleId,
      ativo,
      para,
      valor,
      maxTimeoutSeconds: exige.maxTimeoutSeconds,
    });
  } catch (e) {
    console.log(erro(`     the network would refuse before signing: ${e.message}`));
    return;
  }

  console.log(ok(`     ${entradas.length} authorization signed under rule ${ruleId}`));
  console.log(fraco(`     ${entradas[0].slice(0, 72)}…`));

  const motivo = await conferir({ conta: info.account, ativo, para, valor, entradas });
  if (motivo) {
    console.log(erro(`     the power of attorney refuses: ${motivo}`));
    console.log(fraco("     nothing was sent — the sponsor does not pay for a transaction that reverts."));
    return;
  }
  console.log(ok("     checked: the power of attorney allows this operation"));

  // 4 ────────────────────────────────────────────────────────────────────────
  //
  // Duas rotas de liquidação, e só uma pode acontecer: quem submeter primeiro
  // consome a autorização. O patrocinador é o desenho do Charter — o fundador
  // paga pelo agente. O facilitador é o desenho do x402, e ele também
  // patrocina (`areFeesSponsored: true`).
  passo(4, "Send to the sponsor — the founder pays the fee");
  console.log(fraco("     alternative: declining here goes to the x402 facilitator, in step 5."));
  if (!(await sim("send?"))) {
    passo(5, "Send to the facilitator — x402 settles and sponsors the fee");
    if (!(await sim("send?"))) return;

    let transacao;
    try {
      transacao = await transacaoParaX402({ conta: info.account, ativo, para, valor, entradas });
    } catch (e) {
      console.log(erro(`     could not build the transaction: ${e.message.slice(0, 140)}`));
      return;
    }

    const fim = await liquidar({ transacao, exige });
    console.log(`     HTTP ${fim.status === 200 ? ok("200 OK") : alerta(fim.status)}`);
    console.log(fraco(`     ${fim.corpo.slice(0, 400)}`));
    if (fim.resposta) {
      try {
        console.log(fraco(`     ${Buffer.from(fim.resposta, "base64").toString("utf8").slice(0, 300)}`));
      } catch {
        /* resposta ilegível não interrompe o roteiro */
      }
    }

    passo(6, "Done");
    if (fim.status === 200) {
      console.log(ok(`     ${agente.nome} bought the resource by paying over x402.`));
      console.log(fraco("     the power of attorney decided; the facilitator settled and paid the fee."));
    } else {
      console.log(alerta("     the seller did not release the resource — see the response above."));
    }
    return;
  }

  if (!process.env.SPONSOR_SECRET) {
    console.log(erro("     no SPONSOR_SECRET: that is the key of whoever pays the fee."));
    return;
  }

  let liquidado;
  try {
    liquidado = await patrocinar({ conta: info.account, ativo, para, valor, entradas });
  } catch (e) {
    console.log(erro(`     the sponsor could not submit: ${e.message.slice(0, 160)}`));
    return;
  }

  console.log(ok("     settled on-chain"));
  item("hash", liquidado.hash);
  item("fee paid by", liquidado.patrocinador);
  item("amount left", info.account);
  console.log(fraco(`     https://stellar.expert/explorer/testnet/tx/${liquidado.hash}`));

  // 5 ────────────────────────────────────────────────────────────────────────
  passo(5, "Facilitator");
  console.log(alerta("     nothing to settle: the sponsor already paid, and the authorization is spent."));
  console.log(fraco("     both routes cover the same payment — decline step 4 to use x402."));
  console.log(fraco(`     on-chain proof: ${liquidado.hash}`));

  // 6 ────────────────────────────────────────────────────────────────────────
  passo(6, "Done");
  console.log(ok(`     ${agente.nome} paid for the resource without ever holding XLM.`));
  console.log(fraco("     the power of attorney decided, the sponsor paid, the network recorded it."));
}

titulo();
console.log(fraco(`  seller      ${RECURSO}`));
console.log(fraco(`  facilitator ${FACILITADOR}`));
console.log(fraco(`  registry    ${process.env.CHARTER_REGISTRY ?? "(CHARTER_REGISTRY not set)"}`));

try {
  for (;;) {
    await rodada();
    if (encerrado) break;
    console.log();
    if (!(await sim("another round?"))) break;
  }
} finally {
  rl.close();
  console.log(fraco("\n  done.\n"));
}
