/**
 * Fase 7 — auditoria e disclosure seletiva.
 *
 * Privacidade com porta de auditoria: o público não vê valores, o auditor
 * designado vê tudo, e um fornecedor específico recebe prova de UMA
 * transferência — sem aprender o resto do livro.
 *
 * A criptografia já é coberta pela suíte do SDK (19 testes na fase 0). Aqui se
 * testa que a NOSSA tesouraria é auditável por quem a organização designou.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

describe("fase 7 — auditoria e disclosure", { concurrency: 1 }, () => {
  it("o auditor designado decifra o valor de uma transferência", async () => {
    assert.fail("pendente: decriptação pelo canal do auditor");
  });

  it("auditor com chave errada não recupera o valor", async () => {
    assert.fail("pendente: chave incorreta não abre o ciphertext");
  });

  it("disclosure prova o valor exato ao destinatário indicado", async () => {
    assert.fail("pendente: prova de disclosure verificada");
  });

  it("disclosure vinculada a outro evento é rejeitada", async () => {
    assert.fail("pendente: troca de R_e invalida a prova");
  });

  it("disclosure com nonce repetido é rejeitada", async () => {
    assert.fail("pendente: replay");
  });

  it("o destinatário da disclosure não aprende as demais transferências", async () => {
    assert.fail("pendente: escopo da divulgação");
  });
});
