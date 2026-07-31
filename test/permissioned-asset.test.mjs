/**
 * Fase 6 — ativo permissionado `ALPHA`.
 *
 * Marco da submissão Enterprise. As cotas do fundo só circulam entre
 * investidores com claim KYB válido — e o registro consultado é o MESMO das
 * fases 2 e 4. Essa igualdade não é detalhe de implementação: é a frase que o
 * pitch faz, e por isso tem asserção própria.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";
import { deployments, identity } from "./helpers.mjs";

describe("fase 6 — ativo permissionado", { concurrency: 1 }, () => {
  before(() => {
    assert.ok(identity.identityVerifier, "stack de identidade não implantada");
  });

  it("emite para investidor verificado", async () => {
    assert.fail("pendente: mint do ALPHA para conta com claim");
  });

  it("recusa emissão para endereço sem claim", async () => {
    assert.fail("pendente: mint recusado pelo módulo de compliance");
  });

  it("transfere entre verificados", async () => {
    assert.fail("pendente: transferência entre investidores com claim");
  });

  it("recusa transferência para não verificado", async () => {
    assert.fail("pendente: recusa on-chain na transferência");
  });

  it("revogar o claim recusa a transferência seguinte", async () => {
    assert.fail("pendente: Fluxo F na camada de ativo");
  });

  it("freeze do emissor bloqueia conta antes verificada", async () => {
    assert.fail("pendente: freeze administrativo");
  });

  it("usa o mesmo identity registry do ComplianceGate", async () => {
    assert.fail("pendente: asserção de igualdade de endereço — a frase do pitch");
  });
});
