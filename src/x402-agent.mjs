/**
 * O agente `trader*alphafund` comprando dados de mercado por x402.
 *
 * O que diferencia isto de um cliente x402 comum: o pagador **não** é uma conta
 * clássica com chave solta, é a **conta corporativa** do Charter. O agente
 * assina apenas a auth entry, e a smart account decide on-chain se aquele
 * pagamento cabe na procuração dele — teto de gasto, contrato-alvo permitido,
 * escopo de função e, acima do limiar, claim KYB da contraparte.
 *
 * `CHARTER_MODE=direct` troca o pagador pela conta clássica do agente. Serve
 * para isolar problemas: se `direct` funciona e `charter` não, o defeito está
 * na nossa assinatura, não no x402.
 */
import "dotenv/config";
import { Networks, rpc } from "@stellar/stellar-sdk";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createCharterSigner } from "./charter-signer.mjs";

const NETWORK = process.env.STELLAR_NETWORK || "stellar:testnet";
const URL = process.env.RESOURCE_URL || "http://localhost:3001/market-data";
const MODE = process.env.CHARTER_MODE || "charter";

const signer =
  MODE === "direct"
    ? createEd25519Signer(process.env.AGENT_SECRET, NETWORK)
    : createCharterSigner({
        account: process.env.CHARTER_ACCOUNT,
        agentSecret: process.env.AGENT_SECRET,
        verifier: process.env.ED25519_VERIFIER,
        contextRuleId: Number(process.env.CONTEXT_RULE_ID ?? 0),
        networkPassphrase: Networks.TESTNET,
        rpc: new rpc.Server("https://soroban-testnet.stellar.org"),
      });

console.log(`pagador: ${signer.address} (modo ${MODE})`);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: NETWORK, client: new ExactStellarScheme(signer) }],
});

const started = Date.now();
const res = await fetchWithPayment(URL);
const body = await res.json();

console.log(`status ${res.status} em ${Date.now() - started}ms`);
console.log(body);
