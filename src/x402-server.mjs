/**
 * Vendedor x402: uma API de dados de mercado que cobra por chamada.
 *
 * É a contraparte da demo — quem responde `402 Payment Required` ao agente da
 * AlphaFund. O facilitador (Built on Stellar / OpenZeppelin Channels) verifica
 * e liquida, e cobre a taxa de rede: por isso o agente paga sem nunca possuir
 * XLM.
 */
import "dotenv/config";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";

const NETWORK = process.env.STELLAR_NETWORK || "stellar:testnet";
const PORT = Number(process.env.PORT || 3001);

if (!process.env.OZ_API_KEY) {
  throw new Error(
    "OZ_API_KEY é obrigatória (testnet e mainnet). Gere em " +
      "https://channels.openzeppelin.com/testnet/gen — sem ela o servidor sobe " +
      "sem nenhum meio de pagamento carregado.",
  );
}
if (!process.env.STELLAR_RECIPIENT) {
  throw new Error("STELLAR_RECIPIENT é obrigatória: conta G… que recebe, com trustline de USDC.");
}

const facilitator = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL ?? "https://channels.openzeppelin.com/x402/testnet",
  createAuthHeaders: async () => {
    const h = { Authorization: `Bearer ${process.env.OZ_API_KEY}` };
    return { verify: h, settle: h, supported: h };
  },
});

const resourceServer = new x402ResourceServer(facilitator).register(
  NETWORK,
  new ExactStellarScheme(),
);

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /market-data": {
        accepts: {
          scheme: "exact",
          price: "$0.001",
          network: NETWORK,
          // Conta clássica que recebe — não o contrato do SAC.
          payTo: process.env.STELLAR_RECIPIENT,
        },
        description: "Cotação de mercado — o serviço que o agente compra na demo",
      },
    },
    resourceServer,
  ),
);

app.get("/market-data", (_req, res) => {
  res.json({
    pair: "XLM/USD",
    price: 0.4127,
    ts: new Date().toISOString(),
    source: "charter-demo-feed",
  });
});

app.get("/health", (_req, res) => res.json({ ok: true, network: NETWORK }));

app.listen(PORT, () => {
  console.log(`vendedor x402 em http://localhost:${PORT} (${NETWORK})`);
  console.log(`recebe em ${process.env.STELLAR_RECIPIENT}`);
});
