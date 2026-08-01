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
          Procuração programável para organizações que operam por agentes.
        </h1>
        <p className="mt-5 text-lg text-slate">
          Um agente ou tem a chave inteira do tesouro, ou não transaciona. Aqui ele recebe
          uma procuração: teto, escopo e prazo — verificados pela rede, não por um servidor
          em que a contraparte precise confiar.
        </p>
      </section>

      <section className="mt-14 grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-3">
        {[
          {
            titulo: "Pagamento do agente",
            texto: "Cota, escopo de função e claim da contraparte, aplicados on-chain.",
            marca: "público",
          },
          {
            titulo: "Tesouraria",
            texto: "Folha e liquidação com valores ocultos, abertos ao auditor designado.",
            marca: "confidencial",
          },
          {
            titulo: "Cotas do fundo",
            texto: "Ativo que só circula entre investidores com claim válido.",
            marca: "regulado",
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
        As três consultam o <strong className="font-medium text-ink">mesmo registro de
        identidade</strong>. É daí que vem a garantia: quem perde o claim deixa de receber
        na operação seguinte, sem migrar fundos nem trocar contrato.
      </p>

      <nav className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          { href: "/constituir", titulo: "Constituir organização", texto: "Conta corporativa e procurações em uma transação." },
          { href: "/console", titulo: "Console do operador", texto: "Decisões, ranking e pagamento com previsão de recusa." },
          { href: "/o/alphafund", titulo: "Credencial pública", texto: "O que a contraparte lê antes de negociar. Sem carteira." },
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
