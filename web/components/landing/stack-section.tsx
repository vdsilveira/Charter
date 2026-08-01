"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Como cada primitiva foi aplicada.
 *
 * Num hackathon a pergunta que decide não é "o que você construiu" — é "o que
 * disso é seu". Por isso cada pilar separa em colunas o padrão que já existia
 * do que foi construído sobre ele, e fecha com evidência: um código de erro,
 * um tempo medido, o formato de uma resposta. Afirmação sem prova é slide.
 *
 * Nada de acordeão: esta é a seção mais importante da página, e conteúdo
 * escondido atrás de clique é conteúdo que o jurado não lê.
 */

interface Pilar {
  numero: string;
  padrao: string;
  origem: string[];
  titulo: string;
  standard: string;
  aplicacao: string;
  provas: string[];
}

const pilares: Pilar[] = [
  {
    numero: "01",
    padrao: "Account abstraction",
    origem: ["OpenZeppelin", "stellar-accounts", "Soroban"],
    titulo: "The account is the policy",
    standard:
      "Stellar smart accounts let a contract decide, per call, whether an authorization is valid. Context rules bind signers and policies to a target contract; the host calls the account on every invocation.",
    aplicacao:
      "Each organization deploys a corporate account whose rules encode one power of attorney per agent: a spending cap over a rolling window, the function names it may call, the contract it may touch, and an expiry. The agent signs only the auth entry — it never holds the treasury key. Rule 0 belongs to the administrator and is scoped to the account itself, so the founder adds and removes agents from their own wallet without ever gaining a path to the funds.",
    provas: [
      "payment above the cap → SpendingLimitExceeded (3221)",
      "function outside scope → FunctionNotAllowed (4002)",
      "signers sign sha256(payload ‖ context_rule_ids), never the raw payload",
    ],
  },
  {
    numero: "02",
    padrao: "Agent and institution identity",
    origem: ["ERC-3643", "T-REX", "OpenZeppelin RWA"],
    titulo: "Compliance that enforces, not paperwork that files",
    standard:
      "Claim-based identity for regulated assets: trusted issuers sign claims about a subject, a registry binds wallet to identity, and every transfer consults it before moving value.",
    aplicacao:
      "The full stack runs on testnet — claim topics and issuers, an Ed25519-signed KYB claim, an identity contract per subject, and the registry. Above a per-organization threshold, an agent payment requires the counterparty to hold a valid claim. Revoking that claim refuses the next operation, with no fund migration and no contract swap. The same registry gates the ALPHA share token: it only circulates between verified investors.",
    provas: [
      "unverified counterparty → CounterpartyNotVerified (4003)",
      "no identity at all → IdentityNotFound (321)",
      "frozen by the issuer → AddressFrozen (302)",
    ],
  },
  {
    numero: "03",
    padrao: "Naming — the ENS question, answered the Stellar way",
    origem: ["SEP-2", "Federation", "stellar.toml"],
    titulo: "A label only we understand is not an address",
    standard:
      "Stellar answers naming with federation rather than an on-chain name registry: a domain publishes stellar.toml pointing at a federation server, and any wallet resolves human-readable addresses through it.",
    aplicacao:
      "Organizations and agents are registered as name and sub-name — alphafund, trader*alphafund. The app serves both the TOML and the federation endpoint, so trader*your.domain resolves to the corporate account in any Stellar wallet that never heard of this product. Resolution reads the live credential, which means a removed agent stops resolving instead of handing back a stale address.",
    provas: [
      "GET /federation?q=trader*domain&type=name → { account_id }",
      "removed agent → 404 with `detail`, the shape wallets know how to read",
    ],
  },
  {
    numero: "04",
    padrao: "Private transactions",
    origem: ["Confidential Tokens", "UltraHonk", "Grumpkin", "Nethermind"],
    titulo: "Amounts hidden, balances proven, auditor served",
    standard:
      "A wrapper turns any SEP-41 asset confidential: balances become Pedersen commitments on the Grumpkin curve, and every state change carries a zero-knowledge proof the network verifies on-chain. Confidentiality, not anonymity — addresses stay public.",
    aplicacao:
      "Treasury payroll settles with the amount invisible in the explorer, which is exactly what a regulator accepts: you see who paid whom, not how much. The organization appoints an auditor at registration and that auditor decrypts every transfer through its own channel. A policy contract we wrote gates this layer with the same identity registry the public layer uses — so a revoked claim blocks a confidential deposit too.",
    provas: [
      "unverified account depositing → NotAuthorizedByPolicy (3602)",
      "client-side proofs: register 1.8s · withdraw 2.6s · transfer 2.8s",
      "the registered auditor key opens it; a wrong key recovers nothing",
    ],
  },
  {
    numero: "05",
    padrao: "x402 — agent payments",
    origem: ["x402", "SEP-41", "OZ Channels"],
    titulo: "The agent pays, the policy decides",
    standard:
      "x402 revives HTTP 402: the server answers with payment requirements, the client settles, the resource unlocks. On Stellar the client signs auth entries rather than whole transactions, so a facilitator can sponsor the network fee.",
    aplicacao:
      "The payer is the corporate account, not a loose keypair — the Stellar x402 client accepts contract addresses as payers, which is what makes this possible. So the very policy that governs the treasury also governs an API purchase: the agent signs the auth entry, the smart account checks cap and scope, and the facilitator covers the fee. The agent transacts without ever holding XLM.",
    provas: [
      "inside policy → settled in ~5s",
      "outside policy → refused on-chain, before any money moves",
    ],
  },
];

export function StackSection() {
  const [visivel, setVisivel] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisivel(true),
      { threshold: 0.05 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="infra" ref={ref} className="relative py-28 lg:py-40 overflow-hidden">
      {/* Halo discreto: dá profundidade sem competir com o texto. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-foreground/[0.025] blur-[120px]"
      />

      <div className="relative max-w-[1400px] mx-auto px-6 lg:px-12">
        <header
          className={`max-w-3xl transition-all duration-700 ${
            visivel ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <span className="inline-flex items-center gap-3 font-mono text-sm text-muted-foreground">
            <span className="h-px w-12 bg-foreground/20" />
            How the primitives are applied
          </span>
          <h2 className="mt-7 font-display text-5xl leading-[0.95] tracking-tight md:text-6xl lg:text-7xl">
            Five standards,
            <br />
            one registry
          </h2>
          <p className="mt-7 text-lg leading-relaxed text-muted-foreground">
            None of these standards are ours. What is ours is the composition — and the fact that a
            single identity registry decides in all three layers: the agent&apos;s public payment,
            the confidential treasury, and the regulated asset.
          </p>
        </header>

        <div className="mt-20 lg:mt-28 space-y-20 lg:space-y-32">
          {pilares.map((p, i) => (
            <article
              key={p.numero}
              className={`group relative transition-all duration-700 ${
                visivel ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
              style={{ transitionDelay: `${Math.min(i, 3) * 90}ms` }}
            >
              {/* Cabeçalho do pilar */}
              <div className="grid gap-4 border-t border-foreground/15 pt-8 lg:grid-cols-[7rem_1fr] lg:gap-10">
                <span
                  aria-hidden
                  className="font-display text-5xl leading-none text-foreground/25 tabular-nums transition-colors duration-500 group-hover:text-foreground/50 lg:text-7xl"
                >
                  {p.numero}
                </span>

                <div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="font-mono text-sm uppercase tracking-[0.14em] text-foreground">
                      {p.padrao}
                    </span>
                    <span aria-hidden className="h-4 w-px bg-foreground/25" />
                    {p.origem.map((tec) => (
                      <span
                        key={tec}
                        className="rounded-full border border-foreground/25 px-2.5 py-1 font-mono text-[11px] leading-none text-foreground/85 transition-colors duration-300 group-hover:border-foreground/45"
                      >
                        {tec}
                      </span>
                    ))}
                  </div>

                  <h3 className="mt-3 max-w-3xl font-display text-3xl leading-[1.05] tracking-tight md:text-4xl lg:text-[2.75rem]">
                    {p.titulo}
                  </h3>

                  {/* Padrão à esquerda, o que construímos à direita: a
                      separação é o argumento, então ela é visual também. */}
                  <div className="mt-10 grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        The standard
                      </p>
                      <p className="mt-3 leading-relaxed text-muted-foreground">{p.standard}</p>
                    </div>

                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/70">
                        What we built on it
                      </p>
                      <p className="mt-3 leading-relaxed">{p.aplicacao}</p>
                    </div>
                  </div>

                  {/* Evidência: o que separa esta seção de uma lista de
                      adjetivos. Formatada como saída, não como promessa. */}
                  <ul className="mt-8 space-y-2 border-l-2 border-foreground/20 pl-5">
                    {p.provas.map((prova) => (
                      <li
                        key={prova}
                        className="font-mono text-[13px] leading-relaxed text-muted-foreground"
                      >
                        <span aria-hidden className="mr-2 text-foreground/40">
                          →
                        </span>
                        {prova}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-24 max-w-3xl border-t border-foreground/15 pt-8 text-sm leading-relaxed text-muted-foreground">
          Everything above runs on Stellar testnet today, with contracts anyone can inspect — and
          the proof of each claim is a transaction, not a bullet point.
        </p>
      </div>
    </section>
  );
}
