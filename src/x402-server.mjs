/**
 * Vendedor x402: uma API de dados de mercado que cobra por chamada.
 *
 * É a contraparte da demo — quem responde `402 Payment Required` ao agente da
 * AlphaFund. O facilitador (Built on Stellar / OpenZeppelin Channels) verifica
 * e liquida, e cobre a taxa de rede: por isso o agente paga sem nunca possuir
 * XLM.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
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
// Padrões vindos do deployment: um vendedor de demo não deve exigir três
// variáveis exportadas à mão para subir.
const dep = JSON.parse(readFileSync(new URL("../deployments/testnet.json", import.meta.url), "utf8"));
const ident = JSON.parse(
  readFileSync(new URL("../deployments/identity-testnet.json", import.meta.url), "utf8"),
);

// O ativo tem de ser o mesmo que a procuração do agente tem como alvo; qualquer
// outro é recusado pela policy antes de qualquer outra checagem.
const ATIVO = process.env.PAYMENT_ASSET ?? dep.confidential.underlying;
// Recebedor verificado: acima do limiar de KYB, contraparte sem claim é
// recusada, e a demo pararia por um motivo que não é o que ela quer mostrar.
const RECEBEDOR = process.env.STELLAR_RECIPIENT ?? ident.supplier;

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
          network: NETWORK,
          // Preço como objeto, não como "$0.001": a forma em dólar faz a
          // biblioteca converter para USDC, e aqui quem paga é a conta
          // corporativa com XLM — o mesmo ativo que a procuração do agente tem
          // como alvo. Ativo diferente seria recusado pela policy antes de
          // qualquer outra checagem.
          price: {
            amount: process.env.PAYMENT_AMOUNT ?? "1000000",
            asset: ATIVO,
          },
          // Conta clássica que recebe — não o contrato do SAC.
          payTo: RECEBEDOR,
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
  console.log(`recebe ${process.env.PAYMENT_AMOUNT ?? "1000000"} de ${ATIVO}`);
  console.log(`em ${RECEBEDOR}`);
});
