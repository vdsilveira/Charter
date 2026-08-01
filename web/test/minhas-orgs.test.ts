/**
 * "Minhas organizações", reconstruído do histórico da própria carteira.
 *
 * O registro não guarda índice por fundador nem emite evento: as chaves são
 * `Org(Symbol)` e `Agent(Symbol, Symbol)`, consultáveis só por nome. Quem
 * constituiu uma organização e não anotou o nome não tinha como reencontrá-la —
 * e os rótulos de agente eram um padrão fixo no código (`trader,auditor`), de
 * modo que um agente chamado outra coisa simplesmente não existia para a
 * interface.
 *
 * A saída é ler as operações da conta: toda constituição é uma invocação de
 * `create_org` assinada pelo fundador, com o nome e os agentes nos argumentos.
 * Continua sendo leitura da cadeia — nada é reconstruído de banco próprio.
 */
import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { organizacoesDe } from "@/lib/minhas-orgs";

const REGISTRO = "CCQXTSJUS4NOIXEB6O74S2HAOKSQADCAD453QTHD3E72ROQIMZNTAQ24";
const OUTRO = "CDM2KT6QJZGRNHUMQQ5TMHNEU6KJMADKKCXDFI7NPPXY6HNHV6JNH5VA";
const CARTEIRA = "GDRKHJX4HFW4WGEBPLPNRR65E6VZ54SLUN5WPHKEKRSEF2OZMHQZVRIG";

const b64 = (v: xdr.ScVal) => v.toXDR("base64");
const sym = (s: string) => b64(xdr.ScVal.scvSymbol(s));
const end = (a: string) => b64(new Address(a).toScVal());

/** Uma `AgentRule` como o contrato a recebe — só o que o parser lê. */
function regra(label: string) {
  return b64(
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("label"),
        val: xdr.ScVal.scvString(label),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("target"),
        val: new Address(OUTRO).toScVal(),
      }),
    ]),
  );
}

function vecRegras(...labels: string[]) {
  return b64(
    xdr.ScVal.scvVec(labels.map((l) => xdr.ScVal.fromXDR(regra(l), "base64"))),
  );
}

const criacao = (org: string, ...agentes: string[]) => ({
  type: "invoke_host_function",
  transaction_hash: `hash-${org}`,
  created_at: "2026-08-01T18:21:25Z",
  transaction_successful: true,
  parameters: [
    { type: "Address", value: end(REGISTRO) },
    { type: "Sym", value: sym("create_org") },
    { type: "Sym", value: sym(org) },
    { type: "Address", value: end(CARTEIRA) },
    { type: "Address", value: end(OUTRO) },
    { type: "Vec", value: vecRegras(...agentes) },
  ],
});

const adicao = (org: string, agente: string) => ({
  type: "invoke_host_function",
  transaction_hash: `hash-${org}-${agente}`,
  created_at: "2026-08-01T19:00:00Z",
  transaction_successful: true,
  parameters: [
    { type: "Address", value: end(REGISTRO) },
    { type: "Sym", value: sym("add_agent") },
    { type: "Sym", value: sym(org) },
    { type: "Map", value: regra(agente) },
  ],
});

describe("organizações da carteira", () => {
  it("encontra a organização constituída e seus agentes", () => {
    const r = organizacoesDe([criacao("matrix", "Neo")], REGISTRO);

    expect(r).toHaveLength(1);
    expect(r[0].org).toBe("matrix");
    // O agente foi nomeado "Neo"; um padrão fixo no código nunca o mostraria.
    expect(r[0].agentes).toEqual(["Neo"]);
  });

  it("acumula agentes adicionados depois", () => {
    const r = organizacoesDe([criacao("matrix", "Neo"), adicao("matrix", "Trinity")], REGISTRO);

    expect(r[0].agentes).toEqual(["Neo", "Trinity"]);
  });

  it("não repete agente readicionado", () => {
    const r = organizacoesDe([criacao("matrix", "Neo"), adicao("matrix", "Neo")], REGISTRO);
    expect(r[0].agentes).toEqual(["Neo"]);
  });

  it("ignora invocações de outros contratos", () => {
    const alheia = { ...criacao("matrix", "Neo") };
    alheia.parameters = [{ type: "Address", value: end(OUTRO) }, ...alheia.parameters.slice(1)];

    // Sem isto, qualquer contrato com uma função `create_org` entraria na lista
    // do usuário como se fosse dele.
    expect(organizacoesDe([alheia], REGISTRO)).toHaveLength(0);
  });

  it("ignora outras funções do mesmo registro", () => {
    const pagamento = { ...criacao("matrix"), parameters: [
      { type: "Address", value: end(REGISTRO) },
      { type: "Sym", value: sym("resolve") },
      { type: "Sym", value: sym("matrix") },
    ] };
    expect(organizacoesDe([pagamento], REGISTRO)).toHaveLength(0);
  });

  it("descarta transação que falhou", () => {
    // Constituição revertida não criou organização nenhuma; listá-la mandaria
    // o usuário a uma página que não existe.
    const falha = { ...criacao("matrix", "Neo"), transaction_successful: false };
    expect(organizacoesDe([falha], REGISTRO)).toHaveLength(0);
  });

  it("lista as mais recentes primeiro", () => {
    const antiga = { ...criacao("alphafund", "trader"), created_at: "2026-07-01T00:00:00Z" };
    const nova = { ...criacao("matrix", "Neo"), created_at: "2026-08-01T00:00:00Z" };

    expect(organizacoesDe([antiga, nova], REGISTRO).map((o) => o.org)).toEqual([
      "matrix",
      "alphafund",
    ]);
  });

  it("operação malformada não derruba a lista", () => {
    const lixo = { type: "invoke_host_function", parameters: [{ type: "Sym", value: "nao-e-xdr" }] };
    expect(organizacoesDe([lixo, criacao("matrix", "Neo")], REGISTRO)).toHaveLength(1);
  });

  it("histórico sem constituição devolve lista vazia, não erro", () => {
    expect(organizacoesDe([], REGISTRO)).toEqual([]);
  });
});
