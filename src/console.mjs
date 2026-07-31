/**
 * Console do Charter — credencial pública e feed de decisões.
 *
 * Duas audiências, e é a segunda que define o desenho:
 *
 *   - o **operador** olha o feed e o leaderboard;
 *   - a **contraparte**, que não é cliente e não tem carteira conectada,
 *     consulta a credencial de um agente antes de negociar.
 *
 * Por isso `/api/agent/:org/:label` e `/o/:org` respondem sem autenticação e
 * sem estado local: tudo sai de uma leitura on-chain. Um console que exigisse
 * login para mostrar a credencial não resolveria o problema que motivou o
 * produto — a contraparte teria de confiar no operador de novo.
 *
 * É Express e HTML servidor-renderizado, não Next.js: o valor aqui está no que
 * a página **afirma** e de onde o dado vem, não no framework.
 */
import express from "express";
import { CredentialError, credentialsOf, policyDecisions } from "./credential.mjs";

const REGISTRY = process.env.CHARTER_REGISTRY;
const GATE = process.env.CHARTER_GATE;
const PORT = Number(process.env.PORT ?? 3002);

export function createConsole({ registry = REGISTRY, gate = GATE } = {}) {
  const app = express();

  app.get("/health", (_req, res) => res.json({ ok: true, registry, gate }));

  // A credencial: uma leitura on-chain, legível por máquina.
  app.get("/api/agent/:org/:label", async (req, res) => {
    try {
      const cred = await credentialsOf(registry, req.params.org, req.params.label);
      res.json(cred);
    } catch (err) {
      // Erro estruturado, nunca stack trace: quem consome isto é outro agente.
      const status = err instanceof CredentialError ? err.status : 500;
      res.status(status).json({
        error: err.message,
        contractError: err.code ?? null,
        org: req.params.org,
        label: req.params.label,
      });
    }
  });

  // Feed de decisões — reconstruído da cadeia, sem banco próprio.
  app.get("/api/feed", async (_req, res) => {
    try {
      res.json({ decisions: await policyDecisions(gate) });
    } catch (err) {
      res.status(502).json({ error: String(err.message ?? err) });
    }
  });

  // Leaderboard: `volume_attested` em destaque, porque é o número que custa
  // caro inflar — contagem de operações qualquer um farma.
  app.get("/api/leaderboard/:org", async (req, res) => {
    try {
      const labels = (req.query.agents ?? "trader,auditor").split(",");
      const rows = [];
      for (const label of labels) {
        try {
          const c = await credentialsOf(registry, req.params.org, label.trim());
          rows.push({
            label: c.label,
            active: c.active,
            opsOk: c.conduct.opsOk,
            volumeTotal: c.conduct.volumeTotal,
            volumeAttested: c.conduct.volumeAttested,
          });
        } catch (err) {
          if (!(err instanceof CredentialError) || err.status !== 404) throw err;
        }
      }
      rows.sort((a, b) => Number(BigInt(b.volumeAttested) - BigInt(a.volumeAttested)));
      res.json({ org: req.params.org, agents: rows });
    } catch (err) {
      res.status(502).json({ error: String(err.message ?? err) });
    }
  });

  // Página pública da organização — sem carteira, sem login.
  app.get("/o/:org", async (req, res) => {
    const labels = (req.query.agents ?? "trader,auditor").split(",").map((s) => s.trim());
    const cards = [];
    for (const label of labels) {
      try {
        cards.push(await credentialsOf(registry, req.params.org, label));
      } catch {
        /* agente inexistente simplesmente não vira card */
      }
    }
    res.type("html").send(renderOrg(req.params.org, cards));
  });

  return app;
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function renderOrg(org, cards) {
  const rows = cards
    .map(
      (c) => `
      <article>
        <h2>${esc(c.label)}<span class="${c.active ? "ok" : "off"}">${
          c.active ? "ativo" : "revogado"
        }</span></h2>
        <dl>
          <dt>pode invocar</dt><dd>${
            c.policy.allowedFns.length ? esc(c.policy.allowedFns.join(", ")) : "<em>nada</em>"
          }</dd>
          <dt>exige KYB acima de</dt><dd>${esc(c.policy.kybThreshold)}</dd>
          <dt>operações aprovadas</dt><dd>${c.conduct.opsOk}</dd>
          <dt>volume total</dt><dd>${esc(c.conduct.volumeTotal)}</dd>
          <dt>volume com contraparte verificada</dt><dd><strong>${esc(
            c.conduct.volumeAttested,
          )}</strong></dd>
        </dl>
        <p class="addr">assina por ${esc(c.account)}</p>
      </article>`,
    )
    .join("");

  return `<!doctype html><meta charset="utf-8"><title>${esc(org)} — Charter</title>
<style>
 body{font:15px/1.5 system-ui,sans-serif;max-width:52rem;margin:3rem auto;padding:0 1rem;color:#111}
 h1{margin-bottom:.2rem} .sub{color:#666;margin-top:0}
 article{border:1px solid #ddd;border-radius:8px;padding:1rem 1.2rem;margin:1rem 0}
 h2{margin:0 0 .6rem;font-size:1.1rem;display:flex;justify-content:space-between;align-items:center}
 span.ok{font-size:.72rem;background:#e7f5ec;color:#0a6b34;padding:.15rem .5rem;border-radius:99px}
 span.off{font-size:.72rem;background:#fdeaea;color:#a1121f;padding:.15rem .5rem;border-radius:99px}
 dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;margin:0}
 dt{color:#666} dd{margin:0}
 .addr{color:#888;font-size:.8rem;margin:.8rem 0 0;font-family:ui-monospace,monospace;overflow-wrap:anywhere}
 footer{color:#666;font-size:.85rem;margin-top:2rem;border-top:1px solid #eee;padding-top:1rem}
</style>
<h1>${esc(org)}</h1>
<p class="sub">Procurações vigentes, lidas da rede. Nenhuma carteira necessária.</p>
${rows || "<p>Nenhum agente encontrado.</p>"}
<footer>Cada campo vem de uma leitura on-chain. Nada aqui depende de confiar em quem opera a organização.</footer>`;
}

// Sobe direto quando executado como script.
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!REGISTRY) throw new Error("defina CHARTER_REGISTRY");
  createConsole().listen(PORT, () => {
    console.log(`console em http://localhost:${PORT}`);
    console.log(`  credencial → /api/agent/alphafund/trader`);
    console.log(`  página     → /o/alphafund`);
  });
}
