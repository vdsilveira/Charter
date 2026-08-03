"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { encurtar } from "@/lib/utils";

export interface Decisao {
  tx: string;
  ledger: number;
  /** Para quem o valor foi. */
  para: string;
  amount: string;
  counterpartyVerified: boolean;
}

/**
 * Feed de decisões de política, reconstruído da cadeia.
 *
 * Só o caminho aprovado aparece aqui: a recusa reverte a transação inteira.
 * Tentativa bloqueada se lê das transações falhadas — por isso a simulação
 * prévia existe, e por isso este feed não mente ao ficar vazio.
 *
 * A linha não diz **qual agente** originou a operação. Vinha de um evento
 * próprio do gate, que saiu para o Charter poder operar com o x402 — o
 * facilitador recusa qualquer evento de contrato que não seja `transfer`. A
 * atribuição por agente segue no ranking, que lê o `AgentStats`.
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
      <p role="alert" className="rounded-md bg-denysoft px-3 py-2 text-sm text-deny">
        Could not read the chain: {erro}
      </p>
    );
  }
  if (linhas === null) return <p className="text-sm text-slate">loading…</p>;
  if (linhas.length === 0) {
    return (
      <p className="text-sm text-slate">
        No decisions recorded yet. Every approved operation shows up here.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate">
        <tr>
          <th className="py-2 font-medium">recipient</th>
          <th className="py-2 font-medium">amount</th>
          <th className="py-2 font-medium">counterparty</th>
          <th className="py-2 font-medium">tx</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((d) => (
          <tr key={d.tx} className="border-t border-hairline">
            <td className="py-2 font-mono text-xs">{encurtar(d.para, 6)}</td>
            <td className="py-2">{d.amount}</td>
            <td className="py-2">
              {d.counterpartyVerified ? (
                <Badge variant="ok">verified</Badge>
              ) : (
                <Badge variant="muted">not verified</Badge>
              )}
            </td>
            <td className="py-2 font-mono text-xs text-slate">{encurtar(d.tx, 6)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
