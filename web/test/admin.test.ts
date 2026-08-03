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
import {
  Account,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
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

describe("portão de administração", () => {
  /**
   * O portão usa **assinatura de transação**, não de mensagem.
   *
   * `signMessage` foi tentado primeiro e custou cinco rodadas: a extensão
   * decide o que fazer com o blob, a biblioteca só repassa, e nenhuma das sete
   * formas plausíveis batia. Assinatura de transação não tem essa ambiguidade —
   * o que se assina é o hash da transação, definido pelo protocolo — e é o
   * mesmo caminho que a constituição e o aporte já usam nesta carteira.
   *
   * É o desenho do SEP-10: a transação nasce com sequência 0, o que a torna
   * **impossível de submeter**. Ela serve só como prova de posse da chave.
   */
  function assinar(kp: Keypair, xdr: string): string {
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    tx.sign(kp);
    return tx.toXDR();
  }

  it("aceita a transação de desafio assinada pelo administrador", () => {
    const { xdr } = mod.criarDesafio(admin.publicKey());
    expect(mod.conferirResposta({ xdr: assinar(admin, xdr) })).toBeNull();
  });

  it("recusa outra carteira, mesmo com assinatura válida", () => {
    const intruso = Keypair.random();
    const { xdr } = mod.criarDesafio(intruso.publicKey());
    expect(mod.conferirResposta({ xdr: assinar(intruso, xdr) })).toMatch(
      /not the platform administrator/i,
    );
  });

  it("recusa transação sem assinatura", () => {
    const { xdr } = mod.criarDesafio(admin.publicKey());
    expect(mod.conferirResposta({ xdr })).toMatch(/signature/i);
  });

  it("recusa assinatura de chave diferente da fonte", () => {
    // Declarar o endereço do admin é trivial; provar a posse da chave, não.
    const { xdr } = mod.criarDesafio(admin.publicKey());
    expect(mod.conferirResposta({ xdr: assinar(Keypair.random(), xdr) })).toMatch(/signature/i);
  });

  it("um desafio serve uma vez só", () => {
    const { xdr } = mod.criarDesafio(admin.publicKey());
    const assinada = assinar(admin, xdr);

    expect(mod.conferirResposta({ xdr: assinada })).toBeNull();
    // Reapresentar uma transação capturada não pode funcionar.
    expect(mod.conferirResposta({ xdr: assinada })).toMatch(/unknown or already used/i);
  });

  it("desafio expirado não vale", () => {
    const { xdr } = mod.criarDesafio(admin.publicKey(), 0);
    expect(mod.conferirResposta({ xdr: assinar(admin, xdr) }, 10 * 60_000)).toMatch(/expired/i);
  });

  it("transação forjada fora do servidor é recusada", () => {
    // Sem o nonce que emitimos, não há desafio nenhum a responder.
    const forjada = new TransactionBuilder(new Account(admin.publicKey(), "-1"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      // Nome certo, nonce inventado: é o caminho que importa — sem um desafio
      // que o servidor tenha emitido, não há o que responder.
      .addOperation(Operation.manageData({ name: "charter admin auth", value: "inventado" }))
      .setTimeout(300)
      .build();
    forjada.sign(admin);

    expect(mod.conferirResposta({ xdr: forjada.toXDR() })).toMatch(/unknown/i);
  });

  it("a transação de desafio não pode ser submetida", () => {
    const { xdr } = mod.criarDesafio(admin.publicKey());
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;

    // Sequência 0 é o que garante isso, e é o motivo de o SEP-10 usá-la: a
    // carteira assina uma prova, nunca uma ordem.
    expect(tx.sequence).toBe("0");
  });

  it("XDR malformado vira recusa, não exceção", () => {
    expect(mod.conferirResposta({ xdr: "não é xdr" })).toBeTruthy();
  });

  it("o administrador da plataforma pode ser outra carteira que não a que assina", async () => {
    // Dois papéis: quem **pode pedir** a emissão e qual chave **assina** na
    // cadeia. A segunda vive no servidor por necessidade; a primeira é só uma
    // conferência de endereço.
    const outra = Keypair.random();
    process.env.PLATFORM_ADMIN = outra.publicKey();
    vi.resetModules();
    const m = await import("@/lib/admin");

    const { xdr } = m.criarDesafio(outra.publicKey());
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    tx.sign(outra);
    expect(m.conferirResposta({ xdr: tx.toXDR() })).toBeNull();
  });

  it("sem configuração, cai na chave do servidor", async () => {
    delete process.env.PLATFORM_ADMIN;
    vi.resetModules();
    const m = await import("@/lib/admin");
    expect(m.enderecoDoAdmin()).toBe(admin.publicKey());
  });
});
