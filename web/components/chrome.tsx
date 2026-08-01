"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConectarCarteira from "@/components/conectar-carteira";

const NAV = [
  { href: "/constituir", texto: "Constituir" },
  { href: "/console", texto: "Console" },
  { href: "/o/alphafund", texto: "Credencial" },
];

/**
 * Barra do aplicativo.
 *
 * Três informações e nada mais: onde estou, em que rede estou, e quem está
 * assinando. A rede fica visível o tempo todo de propósito — numa aplicação que
 * move valor, descobrir tarde que se estava na rede errada é caro.
 */
export default function Chrome() {
  const caminho = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-serif text-lg font-semibold tracking-tight">Charter</span>
          <span className="rotulo hidden sm:inline">registro de organizações</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((item) => {
            const ativo = caminho.startsWith(item.href.split("/").slice(0, 2).join("/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  ativo ? "bg-sealsoft text-seal" : "text-slate hover:text-ink"
                }`}
              >
                {item.texto}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <span className="rotulo hidden items-center gap-1.5 sm:flex">
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-ok" />
            testnet
          </span>
          <ConectarCarteira />
        </div>
      </div>
    </header>
  );
}
