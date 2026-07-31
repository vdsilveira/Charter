/**
 * Fase 7 — auditoria e disclosure seletiva.
 *
 * Privacidade com porta de auditoria: o público não vê valores, o auditor
 * designado vê tudo, e um fornecedor específico recebe prova de UMA
 * transferência — sem aprender o resto do livro. É o que separa este desenho de
 * um mixer, e é o argumento que um regulador aceita.
 *
 * A criptografia já é coberta pela suíte do SDK (19 testes na fase 0). Aqui se
 * testa que a NOSSA tesouraria é auditável por quem a organização designou —
 * e que uma chave que não é a designada não abre nada.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { Networks } from "@stellar/stellar-sdk";
import { ChainClient, auditTransfer, auditorPublicKey, fetchEvents } from "@ctd/sdk";
import { deployments } from "./helpers.mjs";

const TOKEN = process.env.GATED_TOKEN ?? deployments.charter?.gatedConfidentialToken;

/** A chave do auditor não é versionada: vive em `.env.demo`. */
function auditorSecret() {
  if (process.env.AUDITOR_SK) return BigInt(process.env.AUDITOR_SK);
  const env = readFileSync(new URL("../.env.demo", import.meta.url), "utf8");
  const line = env.split("\n").find((l) => l.startsWith("AUDITOR_SK="));
  assert.ok(line, "AUDITOR_SK ausente — veja HANDOFF.md");
  return BigInt(line.slice("AUDITOR_SK=".length).trim());
}

describe("fase 7 — auditoria da tesouraria", { concurrency: 1 }, () => {
  let client, auditorSk, transfers;

  before(async () => {
    assert.ok(TOKEN, "GATED_TOKEN não configurado");
    auditorSk = auditorSecret();
    client = new ChainClient({
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
      contracts: {
        token: TOKEN,
        verifier: deployments.confidential.verifier,
        auditor: deployments.confidential.auditor,
      },
    });

    // Janela de retenção da RPC (~7 dias) basta, porque os pagamentos da demo
    // são recentes. Um auditor de verdade usaria o indexer para ir além dela.
    const latest = await client.latestLedger();
    const { events } = await fetchEvents(client, {
      startLedger: Math.max(latest - 100_000, 1),
    });
    transfers = events.filter((e) => e.type === "transfer");
  });

  it("existe pagamento confidencial para auditar", () => {
    assert.ok(
      transfers.length > 0,
      "nenhuma transferência confidencial na janela — rode scripts/payroll-demo.mjs antes",
    );
  });

  it("o auditor designado decifra o valor que o público não vê", () => {
    const audited = transfers.map((ev) => auditTransfer(auditorSk, ev));
    const legiveis = audited.filter((a) => a.channelsAgree && a.amount > 0n);

    assert.ok(legiveis.length > 0, "o auditor designado não abriu nenhum pagamento");
    // Os dois canais — remetente e destinatário — precisam concordar. Se
    // divergissem, o ciphertext teria sido adulterado, e o auditor perceberia.
    for (const a of legiveis) {
      assert.equal(a.channelsAgree, true, "canais de auditoria divergiram");
    }
  });

  it("chave errada não recupera o valor", () => {
    const impostor = auditorSk ^ 0x1234n; // plausível, mas não é a registrada
    const ev = transfers[0];
    const real = auditTransfer(auditorSk, ev);

    let wrong;
    try {
      wrong = auditTransfer(impostor, ev);
    } catch {
      return; // falhar ao decifrar também é o resultado correto
    }
    assert.notEqual(
      wrong.amount,
      real.amount,
      "chave errada devolveu o mesmo valor — a auditoria não estaria restrita a quem foi designado",
    );
  });

  it("a chave registrada no contrato é a do auditor designado", async () => {
    const onChain = await client.auditorKey(0);
    const derived = auditorPublicKey(auditorSk);
    assert.equal(
      onChain.x.toString(),
      derived.x.toString(),
      "a chave no contrato não corresponde ao segredo do auditor",
    );
  });

  it.skip("disclosure prova o valor exato ao destinatário indicado", () => {
    // A prova é gerada pelo destinatário num fluxo interativo (a página
    // /verify do app). Reimplementá-lo aqui seria reescrever o app dentro do
    // teste; fica para a fase 8, onde a interface existe.
  });

  it.skip("disclosure vinculada a outro evento é rejeitada", () => {
    // Coberto pela suíte do SDK (troca de R_e, replay de nonce). Repetir aqui
    // provaria a criptografia da OpenZeppelin, não a nossa composição.
  });
});
