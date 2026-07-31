/**
 * Fase 6 — ativo permissionado `ALPHA`.
 *
 * Marco da submissão Enterprise. As cotas do fundo só circulam entre
 * investidores com claim KYB válido — e o registro consultado é o MESMO das
 * fases 2 e 4. Essa igualdade não é detalhe de implementação: é a frase que o
 * pitch faz, e por isso tem asserção própria. Se alguém apontar o token para
 * outro verifier, este teste quebra antes da demo.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { addr, bool, deployments, hasError, i128, identity, invoke, read, secretOf } from "./helpers.mjs";

const TOKEN = process.env.ALPHA_TOKEN ?? deployments.charter?.alphaToken;
const MINT = 100_000_000n;
const MOVE = 1_000_000n;

// 321 = IdentityNotFound: é assim que "sem claim" se manifesta na borda do
// token — a conta sequer tem identidade vinculada no registry.
const NO_IDENTITY = 321;

describe("fase 6 — ativo permissionado", { concurrency: 1 }, () => {
  let admin, supplier, treasury, stranger;

  before(() => {
    assert.ok(TOKEN, "ALPHA_TOKEN não configurado");
    admin = Keypair.fromSecret(secretOf("admin"));
    supplier = Keypair.fromSecret(secretOf("supplier"));
    treasury = Keypair.fromSecret(secretOf("tesouraria"));
    stranger = Keypair.fromSecret(secretOf("stranger"));
  });

  it("emite para investidor verificado", async () => {
    const r = await invoke(
      TOKEN, "mint",
      [addr(supplier.publicKey()), i128(MINT), addr(admin.publicKey())],
      admin,
    );
    assert.ok(r.ok, `mint deveria passar: ${r.error}`);
  });

  it("recusa emissão para endereço sem claim", async () => {
    const r = await invoke(
      TOKEN, "mint",
      [addr(stranger.publicKey()), i128(MINT), addr(admin.publicKey())],
      admin,
    );
    assert.ok(!r.ok, "deveria ter sido recusada");
    assert.ok(hasError(r, NO_IDENTITY), `esperava ${NO_IDENTITY}, veio: ${r.error}`);
  });

  it("transfere entre verificados", async () => {
    const antes = await read(TOKEN, "balance", [addr(treasury.publicKey())], admin);
    const r = await invoke(
      TOKEN, "transfer",
      [addr(supplier.publicKey()), addr(treasury.publicKey()), i128(MOVE)],
      supplier,
    );
    assert.ok(r.ok, `transferência deveria passar: ${r.error}`);

    const depois = await read(TOKEN, "balance", [addr(treasury.publicKey())], admin);
    assert.equal(
      BigInt(depois.value ?? 0n) - BigInt(antes.value ?? 0n),
      MOVE,
      "o saldo do destinatário deveria subir exatamente o valor movido",
    );
  });

  it("recusa transferência para não verificado", async () => {
    const r = await invoke(
      TOKEN, "transfer",
      [addr(supplier.publicKey()), addr(stranger.publicKey()), i128(MOVE)],
      supplier,
    );
    assert.ok(!r.ok, "deveria ter sido recusada");
    assert.ok(hasError(r, NO_IDENTITY), `esperava ${NO_IDENTITY}, veio: ${r.error}`);
  });

  it("freeze do emissor bloqueia conta antes verificada", async () => {
    const setFrozen = (v) =>
      invoke(
        TOKEN, "set_address_frozen",
        [addr(treasury.publicKey()), bool(v), addr(admin.publicKey())],
        admin,
      );

    const on = await setFrozen(true);
    assert.ok(on.ok, `freeze deveria passar: ${on.error}`);

    try {
      const blocked = await invoke(
        TOKEN, "transfer",
        [addr(treasury.publicKey()), addr(supplier.publicKey()), i128(MOVE)],
        treasury,
      );
      assert.ok(!blocked.ok, "conta congelada não deveria transferir");
      // 302 = AddressFrozen. Claim válido não basta: o emissor ainda manda.
      assert.ok(hasError(blocked, 302), `esperava AddressFrozen (302), veio: ${blocked.error}`);
    } finally {
      await setFrozen(false);
    }
  });

  it("usa o mesmo identity registry das outras camadas", async () => {
    const noToken = await read(TOKEN, "identity_verifier", [], admin);
    assert.ok(noToken.ok, noToken.error);
    assert.equal(
      noToken.value,
      identity.identityVerifier,
      "o ativo consulta outro verifier — a tese das três camadas cai por terra",
    );
  });
});
