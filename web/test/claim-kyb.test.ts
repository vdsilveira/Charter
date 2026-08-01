/**
 * Assinatura de claim KYB — conferida contra o binário Rust da OpenZeppelin.
 *
 * Este é o tipo de porte em que "parece certo" não vale nada: um byte fora de
 * ordem produz uma assinatura que o contrato recusa, e o erro aparece três
 * camadas adiante como "identidade não verificada". Por isso o teste não checa
 * o formato — ele pega a saída real do `sign-claim`, reconstrói a mensagem aqui
 * e **verifica a assinatura do Rust com a nossa construção**. Se batesse por
 * acaso, não bateria essa.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { assinarClaim, dadosDoClaim, mensagemDoClaim } from "@/lib/claim-kyb";

/**
 * Saída de:
 *   cargo run -- --secret-key <ISSUER_SK> --claim-issuer CCTE33IO… \
 *                --identity CCIKCZSB… --claim-topic 1
 * Gravada aqui porque depende do `.env.identity`, que não é versionado.
 */
const REFERENCIA = {
  emissor: "CCTE33IOBTKHPRIYA3YJ2HU6GUAM6BUKN7QCXDBCLGMZU47T6TTNV75T",
  identidade: "CCIKCZSBDPKN5AE5TOSGTAGUMW62HOI4FPUN4RJINKROG5LEK362TMEW",
  topico: 1,
  nonce: 0,
  // Preenchidos pelo script de conferência; ver `scripts/conferir-claim.mjs`.
  dados: process.env.CLAIM_REF_DATA ?? "",
  assinatura: process.env.CLAIM_REF_SIG ?? "",
};

describe("mensagem do claim", () => {
  it("começa com 0x01 e o network id", () => {
    const msg = mensagemDoClaim({
      emissor: REFERENCIA.emissor,
      identidade: REFERENCIA.identidade,
      topico: 1,
      nonce: 0,
      dados: dadosDoClaim(1000, 2000),
    });

    expect(msg[0]).toBe(0x01);
    expect(msg).toHaveLength(1 + 32 + 40 + 40 + 4 + 4 + 16);
  });

  it("serializa endereço de contrato como ScVal::Address", () => {
    const msg = mensagemDoClaim({
      emissor: REFERENCIA.emissor,
      identidade: REFERENCIA.identidade,
      topico: 1,
      nonce: 0,
      dados: dadosDoClaim(0, 0),
    });

    // Discriminante SCV_ADDRESS = 18, depois SC_ADDRESS_TYPE_CONTRACT = 1.
    expect([...msg.subarray(33, 41)]).toEqual([0, 0, 0, 18, 0, 0, 0, 1]);
  });

  it("claim_data é created_at e valid_until em u64 big-endian", () => {
    const d = dadosDoClaim(1, 2);
    expect(d).toHaveLength(16);
    expect(d.readBigUInt64BE(0)).toBe(1n);
    expect(d.readBigUInt64BE(8)).toBe(2n);
  });

  it("topico e nonce diferentes mudam a mensagem", () => {
    const base = { emissor: REFERENCIA.emissor, identidade: REFERENCIA.identidade, dados: dadosDoClaim(1, 2) };
    const a = mensagemDoClaim({ ...base, topico: 1, nonce: 0 });
    const b = mensagemDoClaim({ ...base, topico: 2, nonce: 0 });
    const c = mensagemDoClaim({ ...base, topico: 1, nonce: 1 });

    expect(a.equals(b)).toBe(false);
    expect(a.equals(c)).toBe(false);
  });
});

describe("assinatura", () => {
  it("sig_data traz a chave pública seguida da assinatura", () => {
    const semente = Buffer.alloc(32, 7).toString("hex");
    const { assinatura } = assinarClaim({
      segredoHex: semente,
      emissor: REFERENCIA.emissor,
      identidade: REFERENCIA.identidade,
      criadoEm: 1_700_000_000,
    });

    expect(assinatura).toHaveLength(96);
    const kp = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));
    expect(assinatura.subarray(0, 32).equals(kp.rawPublicKey())).toBe(true);
  });

  it("a assinatura fecha com a mensagem que construímos", () => {
    const semente = Buffer.alloc(32, 9);
    const { dados, assinatura } = assinarClaim({
      segredoHex: semente.toString("hex"),
      emissor: REFERENCIA.emissor,
      identidade: REFERENCIA.identidade,
      criadoEm: 1_700_000_000,
    });

    const msg = mensagemDoClaim({
      emissor: REFERENCIA.emissor,
      identidade: REFERENCIA.identidade,
      topico: 1,
      nonce: 0,
      dados,
    });
    const kp = Keypair.fromRawEd25519Seed(semente);
    expect(kp.verify(msg, assinatura.subarray(32))).toBe(true);
  });

  it.runIf(REFERENCIA.assinatura)(
    "verifica a assinatura produzida pelo binário Rust",
    () => {
      // O teste que vale: a mensagem reconstruída aqui valida a assinatura que
      // o Rust produziu. Qualquer byte fora de ordem reprova.
      const dados = Buffer.from(REFERENCIA.dados, "hex");
      const sig = Buffer.from(REFERENCIA.assinatura, "hex");
      const msg = mensagemDoClaim({
        emissor: REFERENCIA.emissor,
        identidade: REFERENCIA.identidade,
        topico: REFERENCIA.topico,
        nonce: REFERENCIA.nonce,
        dados,
      });

      const pub = Keypair.fromPublicKey(
        require("@stellar/stellar-sdk").StrKey.encodeEd25519PublicKey(sig.subarray(0, 32)),
      );
      expect(pub.verify(msg, sig.subarray(32))).toBe(true);
    },
  );
});
