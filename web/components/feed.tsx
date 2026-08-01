"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { encurtar } from "@/lib/utils";

export interface Decisao {
  tx: string;
  ledger: number;
  agent: string;
  fn: string;
  amount: string;
  counterpartyVerified: boolean;
}

/**
 * Feed de decisões de política, reconstruído da cadeia.
 *
 * Só o caminho aprovado aparece aqui: a recusa reverte a transação e leva o
 * evento junto. Tentativa bloqueada se lê das transações falhadas — por isso a
 * simulação prévia existe, e por isso este feed não mente ao ficar vazio.
 */
export default function Feed({
  carregar,
  intervaloMs = 0,
}: {
  carregar: () => Promise<Decisao[]>;
  intervaloMs?: number;
}) {
  const [linhas, setLinhas] = useState<Decisao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      try {
        const d = await carregar();
        if (vivo) {
          setLinhas(d);
          setErro(null);
        }
      } catch (e) {
        // Falha de leitura não pode virar "lista vazia": são coisas diferentes,
        // e confundi-las esconde uma RPC caída atrás de uma tela plausível.
        if (vivo) setErro(String((e as Error)?.message ?? e));
      }
    };
    buscar();
    if (!intervaloMs) return () => { vivo = false; };
    const t = setInterval(buscar, intervaloMs);
    return () => { vivo = false; clearInterval(t); };
  }, [carregar, intervaloMs]);

  if (erro) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
        Não foi possível ler a cadeia: {erro}
      </p>
    );
  }
  if (linhas === null) return <p className="text-sm text-neutral-500">carregando…</p>;
  if (linhas.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Nenhuma decisão registrada ainda. Cada operação aprovada aparece aqui.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-neutral-500">
        <tr>
          <th className="py-2 font-medium">agente</th>
          <th className="py-2 font-medium">função</th>
          <th className="py-2 font-medium">valor</th>
          <th className="py-2 font-medium">contraparte</th>
          <th className="py-2 font-medium">tx</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((d) => (
          <tr key={d.tx} className="border-t border-neutral-100">
            <td className="py-2">{d.agent}</td>
            <td className="py-2 font-mono text-xs">{d.fn}</td>
            <td className="py-2">{d.amount}</td>
            <td className="py-2">
              {d.counterpartyVerified ? (
                <Badge variant="ok">verificada</Badge>
              ) : (
                <Badge variant="muted">não verificada</Badge>
              )}
            </td>
            <td className="py-2 font-mono text-xs text-neutral-500">{encurtar(d.tx, 6)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
