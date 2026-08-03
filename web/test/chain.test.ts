/**
 * Leitura da cadeia — integração contra a testnet.
 *
 * Herda a cobertura que estava no console Express (removido): os testes de
 * componente usam mocks e provam o comportamento da interface, mas alguém
 * precisa verificar que a leitura de verdade funciona — que `credentials_of`
 * devolve o que se espera, que agente inexistente vira 404 com código, e que o
 * ranking sobrevive a um rótulo que não existe.
 *
 * Roda em ambiente node com `pnpm test:write`.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const dep = JSON.parse(
  readFileSync(new URL("../../deployments/testnet.json", import.meta.url), "utf8"),
);
const ident = JSON.parse(
  readFileSync(new URL("../../deployments/identity-testnet.json", import.meta.url), "utf8"),
);
const ORG = "alphafund";

// Importado dinamicamente: `lib/chain` lê as variáveis de ambiente no topo do
// módulo, então elas precisam existir antes do import.
let chain: typeof import("@/lib/chain");

describe("leitura da cadeia", () => {
  beforeAll(async () => {
    process.env.CHARTER_REGISTRY ??= dep.charter.orgRegistry;
    process.env.CHARTER_GATE ??= dep.charter.complianceGate;
    chain = await import("@/lib/chain");
  });

  it("a credencial traz procuração, conduta e verificação", { timeout: 60_000 }, async () => {
    const c = await chain.credencialDe(ORG, "trader");

    expect(c.label).toBe("trader");
    expect(c.active).toBe(true);
    expect(c.policy.allowedFns).toEqual(["transfer"]);
    expect(c.policy.kybThreshold).toBe("500");
    // O registry consultado é o mesmo das outras camadas — a frase do pitch.
    expect(c.policy.identityRegistry).toBe(ident.identityVerifier);
    expect(typeof c.conduct.opsOk).toBe("number");
  });

  it("o auditor não pode invocar nada", { timeout: 60_000 }, async () => {
    const c = await chain.credencialDe(ORG, "auditor");
    expect(c.policy.allowedFns).toEqual([]);
  });

  it("agente inexistente vira 404 com código de contrato", { timeout: 60_000 }, async () => {
    // Quem consome isto é outro agente: precisa do código, não de stack trace.
    await expect(chain.credencialDe(ORG, "fantasma")).rejects.toMatchObject({
      status: 404,
      codigo: 5002,
    });
  });

  it("organização inexistente também vira 404", { timeout: 60_000 }, async () => {
    await expect(chain.credencialDe("naoexiste", "trader")).rejects.toMatchObject({
      status: 404,
      codigo: 5001,
    });
  });

  it("o ranking ignora rótulo inexistente em vez de quebrar", { timeout: 90_000 }, async () => {
    const linhas = await chain.ranking(ORG, ["trader", "fantasma", "auditor"]);

    expect(linhas.map((l) => l.label)).toEqual(["trader", "auditor"]);
    for (const l of linhas) {
      // As duas métricas são distintas: volume bruto é farmável, volume com
      // contraparte verificada não.
      expect(l).toHaveProperty("volumeTotal");
      expect(l).toHaveProperty("volumeAttested");
    }
  });

  it("o feed vem da cadeia, não de banco próprio", { timeout: 60_000 }, async () => {
    const d = await chain.decisoes();
    expect(Array.isArray(d)).toBe(true);
    // Pode estar vazio — o que não pode é vir de outro lugar.
    for (const x of d) {
      expect(typeof x.tx).toBe("string");
      expect(typeof x.counterpartyVerified).toBe("boolean");
    }
  });

  it("org_of devolve fundador e os agentes atuais", { timeout: 60_000 }, async () => {
    const info = await chain.orgDe("alphafund");

    // A lista vem do registro, não de um padrão no código — e inclui o que foi
    // adicionado depois da constituição, que é o que o redeploy destravou.
    expect(info.agents).toContain("trader");
    expect(info.founder).toMatch(/^G/);
    expect(info.account).toMatch(/^C/);
  });

  it("organização inexistente vira 404, não 500", { timeout: 60_000 }, async () => {
    await expect(chain.orgDe("naoexiste")).rejects.toMatchObject({ status: 404 });
  });
});
