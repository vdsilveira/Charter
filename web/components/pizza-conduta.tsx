/**
 * Rosca da conduta de um agente.
 *
 * A fatia cheia é o volume movido para contraparte **verificada**, e é a única
 * das três medidas que não se infla sozinho: contagem de operações e volume
 * bruto sobem transacionando com a própria segunda conta; volume atestado exige
 * convencer entidades verificadas a negociar.
 *
 * Por isso o desenho mostra essa proporção, e não o total. Um gráfico de volume
 * bruto premiaria exatamente quem inflou.
 *
 * SVG cru, sem biblioteca: são dois arcos e uma regra de três, e o peso de uma
 * dependência de gráficos não se justifica para isso.
 */
const RAIO = 34;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

export default function PizzaConduta({
  total,
  atestado,
}: {
  /** Volume total movido, em unidades do ativo. */
  total: string;
  /** Parte movida para contraparte verificada. */
  atestado: string;
}) {
  const t = BigInt(total || "0");
  const a = BigInt(atestado || "0");

  if (t === 0n) {
    return (
      <p className="text-sm text-slate">
        No operations yet — a new agent has no record, only verifiable powers.
      </p>
    );
  }

  const proporcao = Number((a * 10000n) / t) / 100;
  const preenchido = (proporcao / 100) * CIRCUNFERENCIA;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 80 80"
        className="size-[88px]"
        role="img"
        aria-label={`${Math.round(proporcao)}% of volume moved to a verified counterparty`}
      >
        {/* Fundo: o volume que não é atestado. */}
        <circle cx="40" cy="40" r={RAIO} fill="none" strokeWidth="10" className="stroke-hairline" />
        <circle
          data-testid="arco-atestado"
          cx="40"
          cy="40"
          r={RAIO}
          fill="none"
          strokeWidth="10"
          strokeLinecap="butt"
          className="stroke-seal"
          strokeDasharray={`${preenchido} ${CIRCUNFERENCIA - preenchido}`}
          // Começa no topo: a leitura de proporção em rosca é convenção, e
          // quebrá-la faria o mesmo número parecer outro.
          transform="rotate(-90 40 40)"
        />
        <text
          x="40"
          y="44"
          textAnchor="middle"
          className="fill-ink font-semibold"
          style={{ fontSize: 15 }}
        >
          {Math.round(proporcao)}%
        </text>
      </svg>

      {/* Sem legenda, uma rosca de duas fatias não diz nada. */}
      <p className="max-w-[9rem] text-center text-xs leading-snug text-slate">
        volume to a verified counterparty
      </p>
    </div>
  );
}
