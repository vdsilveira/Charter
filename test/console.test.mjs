/**
 * Fase 8 — console e credencial pública.
 *
 * O critério do PRD: a contraparte decide contratar com UMA leitura, sem
 * indexador. E a UI avisa que uma operação seria recusada ANTES de gastar
 * transação — a simulação prévia, que existe porque o caminho de recusa
 * reverte e não deixa rastro gravável.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

describe("fase 8 — console e credencial", { concurrency: 1 }, () => {
  it("a credencial vem em uma resposta: procuração, conduta e verificação", async () => {
    assert.fail("pendente: /api/agent/[org]/[label]");
  });

  it("agente inexistente responde 404 legível por máquina", async () => {
    assert.fail("pendente: erro estruturado, não stack trace");
  });

  it("agente revogado aparece como active:false, não some", async () => {
    assert.fail("pendente: revogado ≠ inexistente");
  });

  it("o feed reconstrói decisões só a partir de eventos da cadeia", async () => {
    assert.fail("pendente: indexação sem banco próprio");
  });

  it("o leaderboard separa volume_attested de volume_total", async () => {
    assert.fail("pendente: métrica cara de inflar em destaque");
  });

  it("a simulação prévia sinaliza a recusa sem enviar transação", async () => {
    assert.fail("pendente: simulate antes de submit");
  });

  it("a página pública responde sem carteira conectada", async () => {
    assert.fail("pendente: a credencial é para a contraparte, não para o dono");
  });
});
