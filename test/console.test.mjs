/**
 * Fase 8 — console e credencial pública.
 *
 * O critério do PRD: a contraparte decide contratar com UMA leitura, sem
 * indexador e sem carteira conectada. E a UI avisa que uma operação seria
 * recusada ANTES de gastar transação — a simulação prévia, que existe porque o
 * caminho de recusa reverte e não deixa rastro gravável.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { Keypair, Networks, Operation, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { createConsole } from "../src/console.mjs";
import { createCharterSigner } from "../src/charter-signer.mjs";
// `server` do helpers é o RPC; o `http` abaixo é o console. Nomes distintos
// porque os dois convivem neste arquivo.
import { addr, deployments, i128, secretOf, server as rpcServer } from "./helpers.mjs";

const REGISTRY = process.env.CHARTER_REGISTRY ?? deployments.charter?.orgRegistry;
const GATE = process.env.CHARTER_GATE ?? deployments.charter?.complianceGate;
const ORG = process.env.ORG_NAME ?? "alphafund";

describe("fase 8 — console e credencial", { concurrency: 1 }, () => {
  let http, base;

  before(async () => {
    assert.ok(REGISTRY, "CHARTER_REGISTRY não configurado");
    const app = createConsole({ registry: REGISTRY, gate: GATE });
    await new Promise((resolve) => {
      http = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${http.address().port}`;
  });

  after(() => http?.close());

  it("a credencial vem em uma resposta: procuração, conduta e verificação", async () => {
    const res = await fetch(`${base}/api/agent/${ORG}/trader`);
    assert.equal(res.status, 200);
    const c = await res.json();

    assert.equal(c.label, "trader");
    assert.equal(c.active, true);
    // procuração…
    assert.deepEqual(c.policy.allowedFns, ["transfer"]);
    assert.equal(c.policy.kybThreshold, "500");
    // …conduta…
    assert.equal(typeof c.conduct.opsOk, "number");
    // …e verificação: tudo numa resposta só.
    assert.equal(typeof c.orgVerified, "boolean");
  });

  it("o escopo do auditor é vazio — ele não move valor", async () => {
    const res = await fetch(`${base}/api/agent/${ORG}/auditor`);
    assert.equal(res.status, 200);
    const c = await res.json();
    assert.deepEqual(c.policy.allowedFns, [], "auditor não deveria poder invocar nada");
  });

  it("agente inexistente responde 404 legível por máquina", async () => {
    const res = await fetch(`${base}/api/agent/${ORG}/fantasma`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.ok(body.error, "o erro deveria ter mensagem");
    // 5002 = AgentNotFound. Quem consome isto é outro agente: precisa do
    // código, não de um stack trace.
    assert.equal(body.contractError, 5002);
  });

  it("organização inexistente também responde 404", async () => {
    const res = await fetch(`${base}/api/agent/naoexiste/trader`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).contractError, 5001);
  });

  it("o leaderboard separa volume_attested de volume_total", async () => {
    const res = await fetch(`${base}/api/leaderboard/${ORG}`);
    assert.equal(res.status, 200);
    const { agents } = await res.json();

    assert.ok(agents.length >= 2, "esperava trader e auditor");
    for (const a of agents) {
      assert.ok("volumeTotal" in a && "volumeAttested" in a, "as duas métricas são distintas");
    }
  });

  it("o feed reconstrói decisões só a partir de eventos da cadeia", async () => {
    const res = await fetch(`${base}/api/feed`);
    assert.equal(res.status, 200);
    const { decisions } = await res.json();
    // Pode vir vazio — o que não pode é vir de outro lugar que não a cadeia.
    assert.ok(Array.isArray(decisions));
  });

  it("a página pública responde sem carteira conectada", async () => {
    const res = await fetch(`${base}/o/${ORG}`);
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.ok(html.includes("trader"), "a página deveria listar o trader");
    assert.ok(
      html.includes("volume com contraparte verificada"),
      "a métrica cara de inflar é a que ganha destaque",
    );
  });

  it("a simulação prévia sinaliza a recusa sem enviar transação", async () => {
    // Prever a recusa exige simular a operação como ela seria de verdade: a
    // partir da CONTA CORPORATIVA e com a auth entry do agente assinada. Uma
    // simulação sem assinatura não executa `__check_auth`, e a policy nunca
    // roda — foi o que fez a primeira versão deste teste passar batido.
    const orgAccount = deployments.charter.orgAccount;
    const alvo = deployments.confidential.underlying;
    const admin = Keypair.fromSecret(secretOf("admin"));
    // Conta que EXISTE na rede mas não tem claim: uma conta inexistente
    // falharia no próprio SAC (erro 14), antes de a policy opinar — e o teste
    // passaria pelo motivo errado.
    const contraparte = Keypair.fromSecret(secretOf("stranger")).publicKey();

    const signer = createCharterSigner({
      account: orgAccount,
      agentSecret: secretOf("agent-trader"),
      verifier: deployments.accounts.ed25519Verifier,
      contextRuleId: 0, // trader
      networkPassphrase: Networks.TESTNET,
      rpc: rpcServer,
    });

    const op = (auth) =>
      Operation.invokeContractFunction({
        contract: alvo,
        function: "transfer",
        // 900 > limiar de 500: acima dele a contraparte precisa de claim.
        args: [addr(orgAccount), addr(contraparte), i128(900n)],
        ...(auth ? { auth } : {}),
      });

    const source = await rpcServer.getAccount(admin.publicKey());
    const probe = new TransactionBuilder(source, {
      fee: "3000000", networkPassphrase: Networks.TESTNET,
    }).addOperation(op()).setTimeout(60).build();

    const first = await rpcServer.simulateTransaction(probe);
    assert.ok(!rpc.Api.isSimulationError(first), `simulação inicial falhou: ${first.error}`);

    const latest = (await rpcServer.getLatestLedger()).sequence;
    const signed = [];
    for (const e of first.result.auth ?? []) {
      const { signedAuthEntry } = await signer.signAuthEntry(e.toXDR("base64"), {
        validUntilLedgerSeq: latest + 60,
      });
      signed.push(xdr.SorobanAuthorizationEntry.fromXDR(signedAuthEntry, "base64"));
    }

    const withAuth = new TransactionBuilder(await rpcServer.getAccount(admin.publicKey()), {
      fee: "3000000", networkPassphrase: Networks.TESTNET,
    }).addOperation(op(signed)).setTimeout(60).build();

    const previsao = await rpcServer.simulateTransaction(withAuth);
    assert.ok(
      rpc.Api.isSimulationError(previsao),
      "a UI deveria prever a recusa antes de enviar",
    );
    // 4003 = CounterpartyNotVerified: é o motivo que a UI mostra ao operador.
    assert.ok(
      String(previsao.error).includes("4003"),
      `esperava CounterpartyNotVerified (4003), veio: ${String(previsao.error).slice(0, 200)}`,
    );
  });
});
