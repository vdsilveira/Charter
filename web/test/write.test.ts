/**
 * Rotas de escrita — integração contra a testnet.
 *
 * Separadas dos testes de componente porque tocam a rede: são lentas, o estado
 * persiste entre execuções e dependem das chaves em `.env.demo`. Rodar com
 * `pnpm test:write`.
 *
 * O que precisa ser verdade aqui é o que a demo promete: a simulação prevê a
 * recusa antes de gastar transação, e a constituição recusa nome repetido em
 * vez de criar uma segunda organização com o mesmo nome.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { constituirOrg, enviarPagamento, simularPagamento } from "@/lib/write";

/** Chaves de demo não são versionadas: vivem em `.env.demo`. */
function carregarEnv() {
  const texto = readFileSync(new URL("../../.env.demo", import.meta.url), "utf8");
  for (const linha of texto.split("\n")) {
    const [k, ...resto] = linha.split("=");
    if (k && resto.length) process.env[k.trim()] ??= resto.join("=").trim();
  }
}

const dep = JSON.parse(
  readFileSync(new URL("../../deployments/testnet.json", import.meta.url), "utf8"),
);
const ident = JSON.parse(
  readFileSync(new URL("../../deployments/identity-testnet.json", import.meta.url), "utf8"),
);

describe("rotas de escrita", () => {
  beforeAll(() => {
    carregarEnv();
    process.env.CHARTER_REGISTRY ??= dep.charter.orgRegistry;
    process.env.CHARTER_GATE ??= dep.charter.complianceGate;
    process.env.CHARTER_ORG_ACCOUNT ??= dep.charter.orgAccount;
    process.env.CHARTER_TARGET ??= dep.confidential.underlying;
    process.env.CHARTER_ED25519_VERIFIER ??= dep.accounts.ed25519Verifier;
  });

  it(
    "simulação prevê a recusa quando a contraparte não tem claim",
    { timeout: 120_000 },
    async () => {
      const r = await simularPagamento({
        destinatario: ident.stranger, // existe na rede, sem claim KYB
        valor: "900", // acima do limiar de 500
      });

      expect(r.wouldSucceed).toBe(false);
      // 4003 = CounterpartyNotVerified. É o motivo que a UI traduz.
      expect(String(r.error)).toContain("4003");
    },
  );

  it(
    "simulação aprova pagamento abaixo do limiar",
    { timeout: 120_000 },
    async () => {
      // Micropagamento não pode depender de KYB, senão a camada x402 morre.
      const r = await simularPagamento({ destinatario: ident.stranger, valor: "10" });
      expect(r.wouldSucceed).toBe(true);
    },
  );

  it(
    "envia o pagamento que a simulação aprovou",
    { timeout: 180_000 },
    async () => {
      const r = await enviarPagamento({ destinatario: ident.stranger, valor: "10" });
      expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
    },
  );

  it(
    "constituição recusa nome de organização já existente",
    { timeout: 120_000 },
    async () => {
      // `alphafund` já foi constituída: o nome é único e imutável.
      await expect(
        constituirOrg({
          org: "alphafund",
          agentes: [{ label: "trader", allowedFns: ["transfer"], kybThreshold: "500" }],
        }),
      ).rejects.toThrow(/5000/);
    },
  );
});
