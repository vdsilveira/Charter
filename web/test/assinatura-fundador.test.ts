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
   * Bloqueado por uma limitação anterior a esta mudança, e não pelo lado de
   * quem assina.
   *
   * `add_agent`/`remove_agent` chamam `add_context_rule` na conta corporativa.
   * A conta exige a própria autorização, e a regra do administrador usa
   * `Signer::Delegated(fundador)` — que, no `__check_auth`, faz
   * `require_auth_for_args((digest,))` no endereço do fundador. Isso é
   * autorização **fora da raiz**: a simulação em modo gravação não a produz, e
   * o modo `enforce` recusa mesmo com a entrada montada à mão e o footprint
   * refeito em duas passadas.
   *
   * Nunca funcionou contra a rede — só nos testes de contrato, sob
   * `mock_all_auths_allowing_non_root_auth()`, cujo próprio nome descreve o que
   * a rede não concede. Trocar quem assina não muda isso.
   *
   * A saída é de contrato: a regra do administrador precisa delegar ao
   * **endereço do registro**, não ao do fundador. Um contrato autoriza as
   * próprias sub-invocações, então o `__check_auth` passaria sem entrada
   * aninhada — e a garantia continua de pé, porque o registro já exige
   * `founder.require_auth()` na raiz antes de tocar na conta.
   */
  it.skip("adição — bloqueada: Signer::Delegated exige auth fora da raiz", async () => {
    const { xdr } = await montarAdicaoAgente("alphafund", agentes[0], FUNDADOR);
    expect(abrir(xdr).signatures).toHaveLength(0);
  });

  it.skip("remoção — bloqueada pelo mesmo motivo", async () => {
    const { xdr } = await montarRemocaoAgente("alphafund", "trader", FUNDADOR);
    expect(abrir(xdr).signatures).toHaveLength(0);
  });

  it("montar para quem não é fundador é recusado antes de assinar", async () => {
    // Vale mesmo com o bloqueio acima: a recusa vem do registro, na raiz.
    await expect(
      montarAdicaoAgente("alphafund", agentes[0], CARTEIRA_AGENTE),
    ).rejects.toThrow();
  });
});
