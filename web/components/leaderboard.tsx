"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export interface LinhaAgente {
  label: string;
  active: boolean;
  opsOk: number;
  volumeTotal: string;
  volumeAttested: string;
}

/**
 * Ranking de agentes, ordenado por **volume com contraparte verificada**.
 *
 * Contagem de operações e volume bruto são farmáveis: basta transacionar com a
 * própria segunda conta. Volume atestado exige convencer entidades verificadas
 * a negociar com você — que é exatamente o custo que reputação deveria ter. Por
 * isso é essa coluna que ordena, e é ela que fica em destaque.
 */
export default function Leaderboard({ carregar }: { carregar: () => Promise<LinhaAgente[]> }) {
  const [linhas, setLinhas] = useState<LinhaAgente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    carregar()
      .then((d) => vivo && setLinhas([...d].sort((a, b) =>
        Number(BigInt(b.volumeAttested) - BigInt(a.volumeAttested)))))
      .catch((e) => vivo && setErro(String((e as Error)?.message ?? e)));
    return () => { vivo = false; };
  }, [carregar]);

  if (erro) {
    return <p role="alert" className="text-sm text-deny">Could not read the chain: {erro}</p>;
  }
  if (linhas === null) return <p className="text-sm text-slate">loading…</p>;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate">
        <tr>
          <th className="py-2 font-medium">agent</th>
          <th className="py-2 font-medium">approved</th>
          <th className="py-2 font-medium">total volume</th>
          <th className="py-2 font-medium">with a verified counterparty</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((a) => (
          <tr key={a.label} className="border-t border-hairline">
            <td className="py-2">
              {a.label}{" "}
              {!a.active && <Badge variant="alert">revoked</Badge>}
            </td>
            <td className="py-2">{a.opsOk}</td>
            <td className="py-2 text-slate">{a.volumeTotal}</td>
            <td className="py-2 font-semibold">{a.volumeAttested}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
