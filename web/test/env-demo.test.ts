/**
 * Leitura do `.env.demo`.
 *
 * As chaves de assinatura da demo vivem num arquivo na raiz que não é
 * versionado. Os testes de escrita sempre o leram; o servidor do Next, não — e
 * o sintoma disso é a constituição falhar com "variável de ambiente ausente"
 * numa tela onde o operador não tem como saber o que fazer.
 *
 * O que precisa ser verdade aqui vem de um incidente real: um append antigo
 * gravou mensagem de erro do CLI como valor, o `source` do shell quebrou no
 * meio do arquivo e as variáveis seguintes ficaram de fora. O sintoma foi um
 * erro de autorização a três camadas de distância da causa. **Uma linha ruim
 * não pode derrubar as outras.**
 */
import { describe, expect, it } from "vitest";
import { aplicarEnv, parseEnv } from "@/lib/env-demo";

describe("leitura do .env.demo", () => {
  it("lê chave e valor", () => {
    expect(parseEnv("ADMIN_SECRET=SABC123")).toEqual({ ADMIN_SECRET: "SABC123" });
  });

  it("ignora comentários e linhas em branco", () => {
    const r = parseEnv("# chaves da demo\n\nCHARTER_REGISTRY=CCQX\n\n# fim\n");
    expect(r).toEqual({ CHARTER_REGISTRY: "CCQX" });
  });

  it("preserva o '=' dentro do valor", () => {
    // Chave base64 termina em '='; cortar no primeiro separador a corromperia.
    expect(parseEnv("K=YWJj==").K).toBe("YWJj==");
  });

  it("uma linha inválida não derruba as seguintes", () => {
    // Foi exatamente isto que o `source` do shell fez, e custou horas de
    // depuração numa camada errada.
    const r = parseEnv("A=1\nerro: contrato nao encontrado\nB=2\n=semchave\nC=3");
    expect(r).toEqual({ A: "1", B: "2", C: "3" });
  });

  it("aceita espaço em volta do separador", () => {
    expect(parseEnv("CHARTER_CONTEXT_RULE_ID = 1")).toEqual({ CHARTER_CONTEXT_RULE_ID: "1" });
  });

  it("arquivo vazio não é erro — é ausência", () => {
    expect(parseEnv("")).toEqual({});
  });
});

describe("aplicação no ambiente", () => {
  it("injeta o que falta", () => {
    const alvo: NodeJS.ProcessEnv = {};
    expect(aplicarEnv("ADMIN_SECRET=S1\nCHARTER_GATE=C1", alvo)).toEqual([
      "ADMIN_SECRET",
      "CHARTER_GATE",
    ]);
    expect(alvo.ADMIN_SECRET).toBe("S1");
  });

  it("o ambiente real vence o arquivo", () => {
    // Em container as chaves vêm do compose. Um `.env.demo` esquecido no disco
    // trocando a conta que assina seria um erro silencioso e caro.
    const alvo: NodeJS.ProcessEnv = { ADMIN_SECRET: "do-container" };
    expect(aplicarEnv("ADMIN_SECRET=do-arquivo", alvo)).toEqual([]);
    expect(alvo.ADMIN_SECRET).toBe("do-container");
  });
});
