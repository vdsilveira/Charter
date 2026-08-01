import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <header>
        <h1 className="text-3xl font-semibold">Charter</h1>
        <p className="text-neutral-600">
          Um registro de identidade governa três camadas: o pagamento do agente, a
          liquidação confidencial da tesouraria e a transferência do ativo regulado.
        </p>
      </header>
      <nav className="grid gap-3">
        <Link className="rounded-lg border border-neutral-200 bg-white p-4 hover:bg-neutral-50" href="/constituir">
          <strong>Constituir organização</strong>
          <p className="text-sm text-neutral-600">Uma transação cria a conta e as procurações.</p>
        </Link>
        <Link className="rounded-lg border border-neutral-200 bg-white p-4 hover:bg-neutral-50" href="/console">
          <strong>Console do operador</strong>
          <p className="text-sm text-neutral-600">Decisões, ranking e pagamento com simulação prévia.</p>
        </Link>
        <Link className="rounded-lg border border-neutral-200 bg-white p-4 hover:bg-neutral-50" href="/o/alphafund">
          <strong>Credencial pública</strong>
          <p className="text-sm text-neutral-600">O que a contraparte lê antes de negociar. Sem carteira.</p>
        </Link>
      </nav>
    </main>
  );
}
