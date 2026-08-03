/**
 * Domínio e subdomínio via SEP-2 Federation.
 *
 * Hoje `trader*alphafund` só existe dentro deste app. Com Federation, o mesmo
 * rótulo passa a resolver em **qualquer carteira Stellar** — é a diferença
 * entre um apelido interno e um endereço de verdade.
 *
 * O formato é ditado pelo SEP-2 e não é negociável: `stellar.toml` público com
 * `FEDERATION_SERVER`, e um endpoint que responde `{account_id, stellar_address}`
 * ou um erro legível. Uma resposta fora do padrão é indistinguível de servidor
 * quebrado para quem consome.
 */
import { describe, expect, it, vi } from "vitest";
import { resolverFederation, stellarToml } from "@/lib/federation";

const CONTA = "CBICQWN4C5ZM4T62E6PQRQRCFOFH5RJBSV5GPXOAZT6454377W7VLA6A";
const DOMINIO = "charter.example";

const FUNDADOR = "GCCTAKNG7GHF4SYPXGY25DCK7RLLPKMUVODCDUYZNYYVD2XWDIZXGGLQ";

describe("stellar.toml", () => {
  it("publica o endereço do servidor de federation", () => {
    const toml = stellarToml({ dominio: DOMINIO, rede: "Test SDF Network ; September 2015" });

    expect(toml).toContain(`FEDERATION_SERVER="https://${DOMINIO}/federation"`);
    // Sem a passphrase, a carteira não sabe em que rede o endereço vale.
    expect(toml).toContain("NETWORK_PASSPHRASE");
  });
});

describe("resolução federation", () => {
  const resolve = vi.fn(async (org: string, label: string) =>
    org === "alphafund" && ["trader", "auditor"].includes(label) ? CONTA : null,
  );

  it("resolve subdomínio do agente para a conta corporativa", async () => {
    const r = await resolverFederation(
      { q: `trader*${DOMINIO}`, type: "name" },
      { dominio: DOMINIO, org: "alphafund", resolve },
    );

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      stellar_address: `trader*${DOMINIO}`,
      account_id: CONTA,
    });
  });

  it("aceita a forma agente*organizacao*dominio", async () => {
    const r = await resolverFederation(
      { q: `auditor*alphafund*${DOMINIO}`, type: "name" },
      { dominio: DOMINIO, org: "alphafund", resolve },
    );
    expect(r.status).toBe(200);
    expect((r.body as { account_id: string }).account_id).toBe(CONTA);
  });

  it("agente inexistente responde 404 no formato do SEP-2", async () => {
    const r = await resolverFederation(
      { q: `fantasma*${DOMINIO}`, type: "name" },
      { dominio: DOMINIO, org: "alphafund", resolve },
    );

    expect(r.status).toBe(404);
    // O SEP-2 espera `detail`; carteira nenhuma sabe ler o nosso formato.
    expect(r.body).toHaveProperty("detail");
  });

  it("recusa domínio que não é o nosso", async () => {
    const r = await resolverFederation(
      { q: "trader*outrodominio.com", type: "name" },
      { dominio: DOMINIO, org: "alphafund", resolve },
    );
    expect(r.status).toBe(404);
  });

  it("recusa consulta sem asterisco", async () => {
    const r = await resolverFederation(
      { q: "trader", type: "name" },
      { dominio: DOMINIO, org: "alphafund", resolve },
    );
    expect(r.status).toBe(400);
  });

  it("type diferente de name não é suportado", async () => {
    // Só resolvemos nomes: `id` e `forward` pertencem a outro caso de uso, e
    // responder qualquer coisa a eles seria pior que dizer que não atendemos.
    const r = await resolverFederation(
      { q: CONTA, type: "id" },
      { dominio: DOMINIO, org: "alphafund", resolve },
    );
    expect(r.status).toBe(400);
  });

  it("resolve o fundador da organização", async () => {
    // O selo "organização verificada" lê o **fundador**, não a conta
    // corporativa — e é um endereço que ninguém decora. Poder escrever
    // `founder*Matrix*charter.local` tira o passo de copiar 56 caracteres.
    const r = await resolverFederation(
      { q: "founder*Matrix*charter.local", type: "name" },
      {
        dominio: "charter.local",
        org: "alphafund",
        resolve: async () => null,
        fundador: async (org) => (org === "Matrix" ? FUNDADOR : null),
      },
    );

    expect(r.status).toBe(200);
    expect(r.body.account_id).toBe(FUNDADOR);
  });

  it("um agente chamado founder tem precedência sobre a convenção", async () => {
    // Dado do registro vence convenção nossa: quem batizou um agente assim
    // espera resolver o agente.
    const r = await resolverFederation(
      { q: "founder*Matrix*charter.local", type: "name" },
      {
        dominio: "charter.local",
        org: "alphafund",
        resolve: async () => "CCONTA",
        fundador: async () => FUNDADOR,
      },
    );

    expect(r.body.account_id).toBe("CCONTA");
  });

  it("organização sem fundador conhecido continua 404", async () => {
    const r = await resolverFederation(
      { q: "founder*Fantasma*charter.local", type: "name" },
      { dominio: "charter.local", org: "alphafund", resolve: async () => null, fundador: async () => null },
    );

    expect(r.status).toBe(404);
  });

  it("sem resolvedor de fundador, nada muda para quem já integrou", async () => {
    // `fundador` é opcional: quem chamava antes continua funcionando.
    const r = await resolverFederation(
      { q: "founder*Matrix*charter.local", type: "name" },
      { dominio: "charter.local", org: "alphafund", resolve: async () => null },
    );

    expect(r.status).toBe(404);
  });
});
