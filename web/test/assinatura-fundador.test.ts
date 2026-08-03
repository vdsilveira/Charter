/**
 * Constituição e gestão assinadas pelo fundador, no browser.
 *
 * O que precisa ser verdade: o servidor **monta** a transação e nunca a assina.
 * Antes, ele assinava com `ADMIN_SECRET` — a organização acabava fundada pela
 * chave do operador da demo, não pela pessoa que clicou. Quem paga a taxa e
 * quem fica como fundador tem de ser a mesma carteira que apareceu na tela.
 *
 * A transação sai **preparada**: a simulação já rodou, então uma constituição
 * que a rede recusaria falha aqui, antes de a carteira abrir. Pedir assinatura
 * para algo que vai reverter é gastar a confiança do usuário à toa.
 *
 * Roda contra a testnet — precisa das chaves de `.env.demo`.
 */
import { readFileSync } from "node:fs";
import { Keypair, Transaction, TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { aplicarEnv } from "@/lib/env-demo";
import {
  montarAdicaoAgente,
  montarConstituicao,
  montarRemocaoAgente,
} from "@/lib/write";

const CARTEIRA_AGENTE = "GDRKHJX4HFW4WGEBPLPNRR65E6VZ54SLUN5WPHKEKRSEF2OZMHQZVRIG";

/** Um fundador qualquer: só precisa existir na rede para montar a transação. */
let FUNDADOR: string;

beforeAll(() => {
  aplicarEnv(readFileSync(new URL("../../.env.demo", import.meta.url), "utf8"));
  FUNDADOR = Keypair.fromSecret(process.env.ADMIN_SECRET!).publicKey();
});

/** A transação montada, de volta a objeto. */
function abrir(xdr: string): Transaction {
  return TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
}

const agentes = [
  {
    label: "trader",
    carteira: CARTEIRA_AGENTE,
    allowedFns: ["transfer"],
    kybThreshold: "500",
  },
];

describe("constituição para o fundador assinar", () => {
  it("devolve transação sem assinatura nenhuma", async () => {
    const { xdr } = await montarConstituicao({
      fundador: FUNDADOR,
      org: `t${Date.now().toString(36)}`,
      agentes,
    });

    // Uma assinatura aqui significaria que o servidor assinou por alguém.
    expect(abrir(xdr).signatures).toHaveLength(0);
  });

  it("põe o fundador como fonte — é dele que sai a taxa", async () => {
    const { xdr } = await montarConstituicao({
      fundador: FUNDADOR,
      org: `t${Date.now().toString(36)}`,
      agentes,
    });

    expect(abrir(xdr).source).toBe(FUNDADOR);
  });

  it("recusa nome repetido antes de a carteira abrir", async () => {
    // `alphafund` já existe. A simulação acusa na montagem; se passasse, o
    // usuário assinaria uma transação destinada a reverter.
    await expect(
      montarConstituicao({ fundador: FUNDADOR, org: "alphafund", agentes }),
    ).rejects.toThrow(/5000|already exists/i);
  });

  it("exige a carteira de cada agente", async () => {
    await expect(
      montarConstituicao({
        fundador: FUNDADOR,
        org: `t${Date.now().toString(36)}`,
        // Sem carteira, a procuração não teria para quem ser escrita — antes
        // isto virava um par de chaves gerado no servidor e descartado, e o
        // agente nascia incapaz de assinar.
        agentes: [{ label: "trader", carteira: "", allowedFns: [], kybThreshold: "0" }],
      }),
    ).rejects.toThrow(/carteira|wallet/i);
  });

  it("recusa carteira de agente em formato inválido", async () => {
    await expect(
      montarConstituicao({
        fundador: FUNDADOR,
        org: `t${Date.now().toString(36)}`,
        agentes: [{ label: "trader", carteira: "nao-e-endereco", allowedFns: [], kybThreshold: "0" }],
      }),
    ).rejects.toThrow(/inválid|invalid/i);
  });
});

describe("gestão de agentes para o fundador assinar", () => {
  /**
   * Destravado pelo redeploy: a conta passou a expor `adicionar_regra` e
   * `remover_regra`, autorizadas pelo **registro** como gestor.
   *
   * Antes disto, o caminho passava pelo `add_context_rule` do trait da OZ, que
   * exige a autorização da própria conta e cai no `__check_auth` — pedindo auth
   * fora da raiz, que a simulação não grava e o modo `enforce` recusa. Passava
   * só em teste de contrato, sob `mock_all_auths_allowing_non_root_auth()`,
   * cujo nome descreve o que a rede não concede.
   *
   * Autorização de contrato para contrato é concedida ao chamador direto, sem
   * `__check_auth` no caminho. A garantia não mudou de lugar: o registro exige
   * `founder.require_auth()` na raiz antes de tocar na conta.
   */
  it("adição volta sem assinatura e com o fundador na fonte", async () => {
    const { xdr } = await montarAdicaoAgente(
      "alphafund",
      { ...agentes[0], label: `t${Date.now().toString(36).slice(-5)}` },
      FUNDADOR,
    );
    const tx = abrir(xdr);

    expect(tx.signatures).toHaveLength(0);
    expect(tx.source).toBe(FUNDADOR);
  });

  it("remoção volta sem assinatura e com o fundador na fonte", async () => {
    const { xdr } = await montarRemocaoAgente("alphafund", "auditor", FUNDADOR);
    const tx = abrir(xdr);

    expect(tx.signatures).toHaveLength(0);
    expect(tx.source).toBe(FUNDADOR);
  });

  it("rótulo repetido é recusado antes de assinar", async () => {
    // 5006 = LabelTaken. Descobrir na montagem poupa a transação.
    await expect(montarAdicaoAgente("alphafund", agentes[0], FUNDADOR)).rejects.toThrow(/5006/);
  });

  it("quem não é fundador é recusado na montagem", async () => {
    // 5004 = só o fundador administra a própria organização.
    await expect(
      montarAdicaoAgente("alphafund", agentes[0], CARTEIRA_AGENTE),
    ).rejects.toThrow();
  });
});
