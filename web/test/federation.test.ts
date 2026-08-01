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
});
