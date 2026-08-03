/**
 * Portão da área de administração.
 *
 * O que precisa ser verdade: só o administrador da plataforma emite claim KYB.
 * A chave do issuer fica no servidor, então uma rota aberta deixaria qualquer
 * um verificar qualquer carteira — e o selo "organização verificada" viraria
 * enfeite, junto com o argumento do produto.
 *
 * Endereço declarado não prova nada. Daí o desafio e resposta, e daí estes
 * testes cobrirem principalmente as formas de burlá-lo.
 */
import { readFileSync } from "node:fs";
import { Keypair, hash } from "@stellar/stellar-sdk";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { aplicarEnv } from "@/lib/env-demo";

let admin: Keypair;
let mod: typeof import("@/lib/admin");

beforeAll(async () => {
  aplicarEnv(readFileSync(new URL("../../.env.demo", import.meta.url), "utf8"));
  admin = Keypair.fromSecret(process.env.ADMIN_SECRET!);
  mod = await import("@/lib/admin");
});

beforeEach(() => mod.limparDesafios());
// Os casos de configuração recarregam o módulo; limpar evita vazar para os
// seguintes o administrador de um deles.
afterEach(() => delete process.env.PLATFORM_ADMIN);

const assinar = (kp: Keypair, nonce: string) =>
  kp.sign(Buffer.from(nonce, "utf8")).toString("base64");

describe("portão de administração", () => {
  it("aceita o admin com assinatura válida", () => {
    const nonce = mod.criarDesafio();
    expect(
      mod.conferirResposta({
        nonce,
        endereco: admin.publicKey(),
        assinatura: assinar(admin, nonce),
      }),
    ).toBeNull();
  });

  it("recusa outra carteira, mesmo com assinatura própria válida", () => {
    // O caso que importa: a assinatura é legítima, só não é do admin.
    const intruso = Keypair.random();
    const nonce = mod.criarDesafio();

    expect(
      mod.conferirResposta({
        nonce,
        endereco: intruso.publicKey(),
        assinatura: assinar(intruso, nonce),
      }),
    ).toMatch(/not the platform administrator/i);
  });

  it("recusa endereço de admin sem a assinatura correspondente", () => {
    // Declarar o endereço do admin é trivial; provar a posse da chave, não.
    const nonce = mod.criarDesafio();
    expect(
      mod.conferirResposta({
        nonce,
        endereco: admin.publicKey(),
        assinatura: assinar(Keypair.random(), nonce),
      }),
    ).toMatch(/signature does not match/i);
  });

  it("recusa assinatura de outro desafio", () => {
    // Sem isto, uma assinatura capturada valeria para sempre.
    const antigo = mod.criarDesafio();
    const atual = mod.criarDesafio();

    expect(
      mod.conferirResposta({
        nonce: atual,
        endereco: admin.publicKey(),
        assinatura: assinar(admin, antigo),
      }),
    ).toMatch(/signature does not match/i);
  });

  it("um desafio serve uma vez só", () => {
    const nonce = mod.criarDesafio();
    const resposta = { nonce, endereco: admin.publicKey(), assinatura: assinar(admin, nonce) };

    expect(mod.conferirResposta(resposta)).toBeNull();
    // Replay: mesma resposta, segunda vez.
    expect(mod.conferirResposta(resposta)).toMatch(/unknown or already used/i);
  });

  it("desafio expirado não vale", () => {
    const nonce = mod.criarDesafio(0);
    expect(
      mod.conferirResposta(
        { nonce, endereco: admin.publicKey(), assinatura: assinar(admin, nonce) },
        10 * 60_000,
      ),
    ).toMatch(/expired/i);
  });

  it("desafio inventado é recusado", () => {
    expect(
      mod.conferirResposta({
        nonce: "charter-admin-0-inventado",
        endereco: admin.publicKey(),
        assinatura: assinar(admin, "charter-admin-0-inventado"),
      }),
    ).toMatch(/unknown/i);
  });

  it("assinatura malformada vira recusa, não exceção", () => {
    const nonce = mod.criarDesafio();
    expect(
      mod.conferirResposta({ nonce, endereco: admin.publicKey(), assinatura: "não é base64 %%%" }),
    ).toBeTruthy();
  });

  it("dois desafios nunca colidem", () => {
    const vistos = new Set(Array.from({ length: 50 }, () => mod.criarDesafio()));
    expect(vistos.size).toBe(50);
  });

  it("o administrador da plataforma pode ser outra carteira que não a que assina", async () => {
    // Dois papéis diferentes: quem **pode pedir** a emissão e qual chave
    // **assina** na cadeia. A segunda vive no servidor por necessidade; a
    // primeira é só uma conferência de endereço, e não precisa ser a mesma.
    const outra = Keypair.random();
    process.env.PLATFORM_ADMIN = outra.publicKey();
    vi.resetModules();
    const m = await import("@/lib/admin");

    const nonce = m.criarDesafio();
    expect(
      m.conferirResposta({
        nonce,
        endereco: outra.publicKey(),
        assinatura: assinar(outra, nonce),
      }),
    ).toBeNull();
  });

  it("configurado o administrador, a chave que assina deixa de servir de senha", async () => {
    const outra = Keypair.random();
    process.env.PLATFORM_ADMIN = outra.publicKey();
    vi.resetModules();
    const m = await import("@/lib/admin");

    const nonce = m.criarDesafio();
    // Quem tem `ADMIN_SECRET` já assina tudo na cadeia; o que ele não deve
    // ganhar de graça é a tela.
    expect(
      m.conferirResposta({ nonce, endereco: admin.publicKey(), assinatura: assinar(admin, nonce) }),
    ).toMatch(/not the platform administrator/i);
  });

  it("sem configuração, cai na chave do servidor", async () => {
    delete process.env.PLATFORM_ADMIN;
    vi.resetModules();
    const m = await import("@/lib/admin");

    expect(m.enderecoDoAdmin()).toBe(admin.publicKey());
  });

  // -------------------------------------------------------------------------
  // Codificações que a carteira pode devolver
  //
  // `signMessage` entrega o blob à extensão, e é **ela** que decide o que
  // assinar e como devolver — a biblioteca só repassa. Sem um browser aqui, a
  // saída é aceitar as formas plausíveis.
  //
  // Isso não afrouxa o portão: toda candidata continua sendo uma assinatura da
  // chave do admin sobre dado derivado do nosso nonce. Quem não tem a chave não
  // produz nenhuma delas.
  // -------------------------------------------------------------------------

  it("aceita assinatura em hexadecimal", () => {
    const nonce = mod.criarDesafio();
    const sig = admin.sign(Buffer.from(nonce, "utf8")).toString("hex");
    expect(mod.conferirResposta({ nonce, endereco: admin.publicKey(), assinatura: sig })).toBeNull();
  });

  it("aceita assinatura sobre o sha256 do desafio", () => {
    // Carteira que assina o hash da mensagem em vez dos bytes crus.
    const nonce = mod.criarDesafio();
    const sig = admin.sign(hash(Buffer.from(nonce, "utf8"))).toString("base64");
    expect(mod.conferirResposta({ nonce, endereco: admin.publicKey(), assinatura: sig })).toBeNull();
  });

  it("aceita assinatura sobre o desafio em base64", () => {
    // O cliente manda o desafio em base64; esta é a carteira que assina o texto
    // recebido como está, sem decodificar.
    const nonce = mod.criarDesafio();
    const sig = admin.sign(Buffer.from(Buffer.from(nonce, "utf8").toString("base64"), "utf8"));
    expect(
      mod.conferirResposta({
        nonce,
        endereco: admin.publicKey(),
        assinatura: sig.toString("base64"),
      }),
    ).toBeNull();
  });

  it("assinatura de outra carteira não passa em nenhuma codificação", () => {
    const intruso = Keypair.random();
    for (const bytes of [
      Buffer.from(mod.criarDesafio(), "utf8"),
      hash(Buffer.from("qualquer", "utf8")),
    ]) {
      const nonce = mod.criarDesafio();
      expect(
        mod.conferirResposta({
          nonce,
          endereco: admin.publicKey(),
          assinatura: intruso.sign(bytes).toString("base64"),
        }),
      ).toBeTruthy();
    }
  });

  it("aceita a carteira que decodifica o base64 antes de assinar", () => {
    // É o comportamento documentado do `signBlob` do Freighter, e a razão de o
    // cliente mandar o desafio já codificado: decodificado, volta a ser
    // exatamente os bytes do nonce.
    const nonce = mod.criarDesafio();
    const decodificado = Buffer.from(Buffer.from(nonce, "utf8").toString("base64"), "base64");

    expect(
      mod.conferirResposta({
        nonce,
        endereco: admin.publicKey(),
        assinatura: admin.sign(decodificado).toString("base64"),
      }),
    ).toBeNull();
  });

  it("o diagnóstico nomeia o que a carteira assinou", async () => {
    // Existe porque quatro tentativas seguidas falharam sem dizer a causa. Com
    // a chave no servidor, dá para responder em vez de adivinhar.
    const nonce = mod.criarDesafio();
    const b64 = Buffer.from(nonce, "utf8").toString("base64");

    expect(
      mod.diagnosticar(nonce, admin.sign(Buffer.from(b64, "utf8")).toString("base64")),
    ).toMatch(/base64/i);
    expect(mod.diagnosticar(nonce, admin.sign(Buffer.from(nonce, "utf8")).toString("base64"))).toMatch(
      /bytes do nonce/i,
    );
  });

  it("diagnóstico diz quando nenhuma candidata bate", () => {
    const nonce = mod.criarDesafio();
    // Assinatura sobre algo que não deriva do nonce: é o sinal de que a lista
    // de candidatas está incompleta, e não de que a carteira está errada.
    const outra = admin.sign(Buffer.from("nada a ver", "utf8")).toString("base64");
    expect(mod.diagnosticar(nonce, outra)).toMatch(/nenhuma das/i);
  });
});
