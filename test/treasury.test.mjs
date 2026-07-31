/**
 * Fase 5 — tesouraria confidencial.
 *
 * Fluxos E e F do SPEC: a organização paga fornecedores com valores ocultos, e
 * cada agente opera por uma **procuração confidencial** (`set_spender`) com
 * teto e prazo — sem jamais receber a chave de gasto do tesouro.
 *
 * É a mesma tese da camada pública, no regime privado: quem move valor, até
 * quanto, para quem, e quem tem direito de ver.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import {
  Keypair, addr, addressOf, deployments, hasError, i128, identity, invoke, read,
  secretOf, server,
} from "./helpers.mjs";

const TOKEN = process.env.GATED_TOKEN ?? deployments.charter?.gatedConfidentialToken;
const DEPOSIT = 2_000_000n; // 0,2 XLM
const ALLOWANCE = 500_000n;

describe("fase 5 — tesouraria confidencial", { concurrency: 1 }, () => {
  let treasury; // conta corporativa da organização (verificada)
  let stranger; // sem claim KYB

  before(() => {
    assert.ok(TOKEN, "GATED_TOKEN não configurado");
    treasury = Keypair.fromSecret(secretOf("supplier"));
    stranger = Keypair.fromSecret(secretOf("stranger"));
  });

  it("a tesouraria deposita no espaço confidencial", async () => {
    const r = await invoke(
      TOKEN,
      "deposit",
      [addr(treasury.publicKey()), addr(treasury.publicKey()), i128(DEPOSIT)],
      treasury,
    );
    assert.ok(r.ok, `depósito deveria passar: ${r.error}`);
  });

  it("merge move o recebido para gastável, sem prova", async () => {
    const r = await invoke(TOKEN, "merge", [addr(treasury.publicKey())], treasury);
    assert.ok(r.ok, `merge deveria passar: ${r.error}`);
  });

  it("conta sem claim KYB é recusada pela policy", async () => {
    const r = await invoke(
      TOKEN,
      "deposit",
      [addr(stranger.publicKey()), addr(treasury.publicKey()), i128(DEPOSIT)],
      stranger,
    );
    assert.ok(!r.ok, "deveria ter sido recusada");
    assert.ok(hasError(r, 3602), `esperava NotAuthorizedByPolicy (3602), veio: ${r.error}`);
  });

  it("agente sem delegação não é spender", async () => {
    const agent = Keypair.random();
    const r = await read(
      TOKEN,
      "is_spender",
      [addr(treasury.publicKey()), addr(agent.publicKey())],
      treasury,
    );
    assert.ok(r.ok, r.error);
    assert.equal(r.value, false);
  });

  it("set_spender cria a procuração confidencial do agente", async () => {
    const agent = await import("./helpers.mjs").then((m) => m.freshAccount());
    const until = (await server.getLatestLedger()).sequence + 5000;

    const r = await invoke(
      TOKEN,
      "set_spender",
      [addr(treasury.publicKey()), addr(agent.publicKey()), { u32: until }, { bytes: "" }],
      treasury,
    );
    assert.ok(r.ok, `set_spender deveria passar: ${r.error}`);

    const isSpender = await read(
      TOKEN,
      "is_spender",
      [addr(treasury.publicKey()), addr(agent.publicKey())],
      treasury,
    );
    assert.equal(isSpender.value, true, "a delegação deveria estar ativa");
  });

  it("delegação expirada deixa de valer sem precisar de revogação", async () => {
    assert.fail("pendente: delegação com live_until_ledger no passado");
  });

  it("revoke_spender devolve a alçada ao tesouro", async () => {
    assert.fail("pendente: revogação da procuração confidencial");
  });

  it("delegação duplicada para o mesmo par é recusada", async () => {
    assert.fail("pendente: DelegationAlreadyExists (3503)");
  });

  it("o valor delegado não aparece em claro no evento", async () => {
    assert.fail("pendente: inspeção do evento de set_spender");
  });
});
