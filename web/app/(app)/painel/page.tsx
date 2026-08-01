import Link from "next/link";

/**
 * Abertura.
 *
 * A tese primeiro, porque é ela que distingue o produto: um registro governa
 * três camadas. Sem hero decorativo — quem chega aqui quer constituir, operar
 * ou verificar, e as três portas ficam à vista.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <section className="max-w-2xl">
        <p className="rotulo">Stellar · testnet</p>
        <h1 className="mt-3 font-serif text-4xl leading-[1.1] sm:text-5xl">
          Programmable power of attorney for organizations that operate through agents.
        </h1>
        <p className="mt-5 text-lg text-slate">
          An agent either holds the whole treasury key or cannot transact at all. Here it gets a
          power of attorney instead: ceiling, scope and term — enforced by the network, not by a
          server the counterparty has to trust.
        </p>
      </section>

      <section className="mt-14 grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-3">
        {[
          {
            titulo: "Agent payment",
            texto: "Quota, function scope and counterparty claim, enforced on-chain.",
            marca: "public",
          },
          {
            titulo: "Treasury",
            texto: "Payroll and settlement with hidden amounts, open to the designated auditor.",
            marca: "confidential",
          },
          {
            titulo: "Fund shares",
            texto: "An asset that only circulates among investors holding a valid claim.",
            marca: "regulated",
          },
        ].map((c) => (
          <article key={c.titulo} className="bg-surface p-6">
            <p className="rotulo">{c.marca}</p>
            <h2 className="mt-2 font-serif text-xl">{c.titulo}</h2>
            <p className="mt-2 text-sm text-slate">{c.texto}</p>
          </article>
        ))}
      </section>

      <p className="mt-8 max-w-2xl border-l-2 border-seal pl-4 text-sm text-slate">
        All three consult the <strong className="font-medium text-ink">same identity
        registry</strong>. That is where the guarantee comes from: whoever loses the claim stops
        receiving on the very next operation — no fund migration, no contract swap.
      </p>

      <nav className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          { href: "/constituir", titulo: "Charter an organization", texto: "Corporate account and powers of attorney in one transaction." },
          { href: "/console", titulo: "Operator console", texto: "Decisions, ranking and payment with the refusal predicted." },
          { href: "/o/alphafund", titulo: "Public credential", texto: "What the counterparty reads before dealing. No wallet." },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group rounded-lg border border-hairline bg-surface p-5 transition-colors hover:border-seal"
          >
            <h3 className="font-medium group-hover:text-seal">{l.titulo}</h3>
            <p className="mt-1 text-sm text-slate">{l.texto}</p>
          </Link>
        ))}
      </nav>
    </main>
  );
}
