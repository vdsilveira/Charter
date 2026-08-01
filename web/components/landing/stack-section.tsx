"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Como cada primitiva foi aplicada.
 *
 * Num hackathon, a pergunta que decide não é "o que você construiu" — é "o que
 * disso é seu e o que já existia". Por isso cada bloco separa o padrão da
 * aplicação, e fecha com uma evidência: um endereço, um código de erro, um
 * tempo medido. Afirmação sem prova é slide.
 */

interface Pilar {
  numero: string;
  padrao: string;
  titulo: string;
  descricao: string;
  aplicacao: string;
  prova: string;
}

const pilares: Pilar[] = [
  {
    numero: "01",
    padrao: "Account abstraction",
    titulo: "The account is the policy",
    descricao:
      "Stellar smart accounts let a contract decide, per call, whether an authorization is valid. We compose OpenZeppelin's account framework instead of reimplementing it.",
    aplicacao:
      "Every organization deploys a corporate account whose context rules encode one power of attorney per agent: spending cap over a rolling window, allowed function names, target contract and expiry. The agent signs only the auth entry — it never holds the treasury key. Rule 0 belongs to the administrator, scoped to the account itself, so the founder can add and remove agents from their own wallet without ever gaining a path to the funds.",
    prova: "A payment above the cap dies on-chain with SpendingLimitExceeded (3221).",
  },
  {
    numero: "02",
    padrao: "Agent and institution identity",
    titulo: "Compliance that is enforcement, not paperwork",
    descricao:
      "ERC-3643 (T-REX) brings claim-based identity to regulated assets: trusted issuers sign claims, a registry stores them, and transfers consult it.",
    aplicacao:
      "The full stack runs on testnet — claim topics and issuers, an Ed25519-signed KYB claim, an identity contract per subject and the registry that binds wallet to identity. Above a per-organization threshold, an agent payment requires the counterparty to hold a valid claim. Revoking the claim refuses the next operation, with no fund migration and no contract swap.",
    prova: "Unverified counterparty: CounterpartyNotVerified (4003). No identity at all: 321.",
  },
  {
    numero: "03",
    padrao: "Naming — the ENS question on Stellar",
    titulo: "A label only we understand is not an address",
    descricao:
      "Stellar answers naming with SEP-2 Federation rather than an on-chain name registry: a domain publishes a federation server, and any wallet resolves human-readable addresses through it.",
    aplicacao:
      "Organizations and agents are registered as name and sub-name — alphafund, trader*alphafund. The app publishes stellar.toml and a federation endpoint, so trader*your.domain resolves to the corporate account in any Stellar wallet, with no knowledge of this product. Resolution reads the live credential: a removed agent stops resolving instead of returning a stale address.",
    prova: "GET /federation?q=trader*domain&type=name → {account_id}. Unknown agent → 404 with detail.",
  },
  {
    numero: "04",
    padrao: "Private transactions",
    titulo: "Amounts hidden, balances proven, auditor served",
    descricao:
      "Confidential tokens wrap any SEP-41 asset: balances become Pedersen commitments on Grumpkin, and every state change carries an UltraHonk proof the network verifies on-chain.",
    aplicacao:
      "Treasury payroll settles with the amount invisible in the explorer — sender and recipient stay public, which is what a regulator wants. The organization appoints an auditor at registration, and that auditor decrypts every transfer through its own channel. A policy contract we wrote gates the confidential layer with the same identity registry used by the public one, so a revoked claim blocks a confidential deposit too.",
    prova: "Unverified account depositing: NotAuthorizedByPolicy (3602). Proofs verify in 1.6–2.8s.",
  },
  {
    numero: "05",
    padrao: "x402 — agent payments",
    titulo: "The agent pays, the policy decides",
    descricao:
      "x402 revives HTTP 402: a server answers with payment requirements, the client settles, the resource unlocks. On Stellar the client signs auth entries rather than whole transactions.",
    aplicacao:
      "The buyer is the corporate account, not a loose keypair — the x402 Stellar client accepts contract addresses as payers. So the same policy that governs the treasury governs an API purchase: the agent signs the auth entry, the smart account checks cap and scope, and the facilitator sponsors the network fee. The agent pays without ever holding XLM.",
    prova: "Inside policy: settled. Outside: refused on-chain, before any money moves.",
  },
];

export function StackSection() {
  const [visivel, setVisivel] = useState(false);
  const [aberto, setAberto] = useState(0);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisivel(true),
      { threshold: 0.1 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="infra" ref={ref} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div
          className={`mb-16 transition-all duration-700 ${
            visivel ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
            <span className="w-12 h-px bg-foreground/20" />
            How the primitives are applied
          </span>
          <h2 className="mt-6 text-4xl md:text-5xl lg:text-6xl font-display leading-[0.95] tracking-tight max-w-3xl">
            Five standards, one registry
          </h2>
          <p className="mt-5 max-w-2xl text-muted-foreground">
            None of these are ours. What is ours is the composition — and the fact that a single
            identity registry decides in all three layers: the agent&apos;s public payment, the
            confidential treasury and the regulated asset.
          </p>
        </div>

        <div className="border-t border-foreground/10">
          {pilares.map((p, i) => {
            const ativo = aberto === i;
            return (
              <article
                key={p.numero}
                className={`border-b border-foreground/10 transition-all duration-700 ${
                  visivel ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                }`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <button
                  type="button"
                  onClick={() => setAberto(ativo ? -1 : i)}
                  aria-expanded={ativo}
                  className="w-full grid grid-cols-[auto_1fr_auto] items-baseline gap-4 lg:gap-8 py-6 text-left group"
                >
                  <span className="font-mono text-xs text-muted-foreground">{p.numero}</span>
                  <span>
                    <span className="block font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {p.padrao}
                    </span>
                    <span className="mt-1 block text-xl lg:text-2xl font-display leading-tight group-hover:opacity-70 transition-opacity">
                      {p.titulo}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`font-mono text-lg text-muted-foreground transition-transform duration-300 ${
                      ativo ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>

                <div
                  className={`grid transition-all duration-500 ${
                    ativo ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6 lg:gap-12 pb-8 lg:pl-[calc(2rem+1ch)]">
                      <p className="text-sm leading-relaxed text-muted-foreground">{p.descricao}</p>
                      <div className="space-y-4">
                        <p className="text-sm leading-relaxed">{p.aplicacao}</p>
                        <p className="font-mono text-xs leading-relaxed text-muted-foreground border-l border-foreground/20 pl-4">
                          {p.prova}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <p className="mt-10 max-w-3xl text-sm text-muted-foreground">
          Everything above runs on Stellar testnet, with contracts anyone can inspect — and the
          proof of each claim is a transaction, not a bullet point.
        </p>
      </div>
    </section>
  );
}
