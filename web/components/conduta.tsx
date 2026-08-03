import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface AgenteConduta {
  label: string;
  conduct: {
    opsOk: number;
    volumeTotal: string;
    volumeAttested: string;
    firstSeen: number;
  };
}

/**
 * Conduta dos agentes, lado a lado.
 *
 * A barra existe para tornar visível **a distinção entre volume que conta e
 * volume que não conta**. Contagem de operações e volume bruto são farmáveis:
 * basta transacionar com a própria segunda conta. Volume com contraparte
 * verificada exige convencer entidades verificadas a negociar — que é o custo
 * que reputação deveria ter.
 *
 * Por isso a parte escura da barra é a atestada, e a proporção aparece em
 * número. Um gráfico que mostrasse só o total inverteria a mensagem: premiaria
 * exatamente quem inflou.
 *
 * Sem biblioteca de gráficos: duas barras e uma regra de três não justificam o
 * peso, e CSS dá controle exato sobre o que a escala comunica.
 */
export default function Conduta({ agentes }: { agentes: AgenteConduta[] }) {
  if (agentes.length === 0) return null;

  // Escala comum entre agentes: sem ela, dois volumes muito diferentes
  // apareceriam com barras iguais, e a comparação — que é o ponto — se perderia.
  const maior = agentes.reduce(
    (m, a) => (BigInt(a.conduct.volumeTotal) > m ? BigInt(a.conduct.volumeTotal) : m),
    1n,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conduct</CardTitle>
        <CardDescription>
          The dark part is volume moved to a <strong>verified</strong> counterparty. Operation
          counts and raw volume are farmable — trading with your own second account inflates both.
          Attested volume is not.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {agentes.map((a) => {
          const total = BigInt(a.conduct.volumeTotal);
          const atestado = BigInt(a.conduct.volumeAttested);

          if (total === 0n) {
            return (
              <div key={a.label} className="space-y-1">
                <p className="font-medium">{a.label}</p>
                {/* Barra vazia parece medida; ausência de histórico é
                    informação, e o produto vive de dizer isso sem rodeio. */}
                <p className="text-sm text-slate">
                  No operations yet — a new agent has no record, only verifiable powers.
                </p>
              </div>
            );
          }

          const proporcao = Number((atestado * 100n) / total);
          const larguraTotal = Number((total * 100n) / maior);

          return (
            <div key={a.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-medium">{a.label}</p>
                <p className="font-mono text-xs text-slate">
                  {a.conduct.opsOk} approved · {proporcao}% attested
                </p>
              </div>

              <div className="h-3 w-full overflow-hidden rounded-full bg-hairline">
                <div
                  data-testid={`barra-total-${a.label}`}
                  className="h-full rounded-full bg-slate/25"
                  style={{ width: `${larguraTotal}%` }}
                >
                  <div
                    data-testid={`barra-atestado-${a.label}`}
                    className="h-full rounded-full bg-seal"
                    style={{ width: `${proporcao}%` }}
                  />
                </div>
              </div>

              <p className="font-mono text-xs text-slate">
                {a.conduct.volumeAttested} of {a.conduct.volumeTotal}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
