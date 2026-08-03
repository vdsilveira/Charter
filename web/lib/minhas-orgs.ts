/**
 * As organizações de uma carteira, lidas do histórico dela.
 *
 * O `OrgRegistry` guarda `Org(Symbol)` e `Agent(Symbol, Symbol)`: dá para
 * consultar por nome, nunca para enumerar. Não há índice por fundador nem
 * evento de criação. Quem constituiu e não anotou o nome não reencontrava a
 * própria organização, e os rótulos de agente eram um padrão fixo no código —
 * um agente chamado "Neo" não existia para a interface.
 *
 * A saída não exige mudar contrato: toda constituição é uma invocação de
 * `create_org` assinada pelo fundador, e o nome e os agentes estão nos
 * argumentos. Continua sendo leitura da cadeia — o Horizon indexa o que o
 * ledger já contém, e nada aqui vem de banco nosso.
 *
 * O limite honesto: se o Horizon consultado tiver janela de retenção curta,
 * organizações antigas somem da lista. Elas continuam existindo e acessíveis
 * pelo nome; o que se perde é a descoberta.
 */
import { scValToNative, xdr } from "@stellar/stellar-sdk";

export interface OrgDaCarteira {
  org: string;
  agentes: string[];
  hash: string;
  criadaEm: string;
  /**
   * Saldo do tesouro em stroops. Ausente quando a leitura falhou — que é
   * diferente de zero, e leva a decisões opostas.
   */
  saldo?: string;
}

/** Uma operação do Horizon; só os campos que interessam. */
interface Operacao {
  type?: string;
  transaction_hash?: string;
  created_at?: string;
  transaction_successful?: boolean;
  parameters?: { type?: string; value?: string }[];
}

const nativo = (b64?: string) =>
  b64 ? scValToNative(xdr.ScVal.fromXDR(b64, "base64")) : undefined;

/** O `label` de uma `AgentRule`, seja ela mapa nativo ou objeto. */
function rotulo(regra: unknown): string | null {
  if (regra instanceof Map) return String(regra.get("label") ?? "") || null;
  if (regra && typeof regra === "object" && "label" in regra) {
    return String((regra as { label: unknown }).label ?? "") || null;
  }
  return null;
}

/**
 * Reduz as operações da conta às organizações que ela fundou.
 *
 * Puro de propósito: a busca no Horizon fica em `buscarOrganizacoes`, e o que
 * é difícil de acertar — filtrar o contrato certo, acumular agentes, descartar
 * transação revertida — se testa sem rede.
 */
export function organizacoesDe(operacoes: unknown[], registro: string): OrgDaCarteira[] {
  const porNome = new Map<string, OrgDaCarteira>();

  for (const bruta of operacoes) {
    const op = bruta as Operacao;
    if (op?.type !== "invoke_host_function") continue;
    // Reverteu: não criou organização nenhuma, e listá-la mandaria o usuário a
    // uma página que não existe.
    if (op.transaction_successful === false) continue;

    const p = op.parameters ?? [];
    if (p.length < 3) continue;

    try {
      // Sem conferir o contrato, qualquer outro com uma função de mesmo nome
      // entraria na lista do usuário como se fosse dele.
      if (String(nativo(p[0]?.value)) !== registro) continue;

      const fn = String(nativo(p[1]?.value));
      const nome = String(nativo(p[2]?.value));
      if (!nome) continue;

      if (fn === "create_org") {
        const regras = (nativo(p[5]?.value) as unknown[]) ?? [];
        porNome.set(nome, {
          org: nome,
          agentes: regras.map(rotulo).filter((l): l is string => Boolean(l)),
          hash: op.transaction_hash ?? "",
          criadaEm: op.created_at ?? "",
        });
      } else if (fn === "add_agent") {
        const existente = porNome.get(nome);
        const label = rotulo(nativo(p[3]?.value));
        if (existente && label && !existente.agentes.includes(label)) {
          existente.agentes.push(label);
        }
      } else if (fn === "remove_agent") {
        const existente = porNome.get(nome);
        const label = String(nativo(p[3]?.value) ?? "");
        if (existente) existente.agentes = existente.agentes.filter((l) => l !== label);
      }
    } catch {
      // Uma operação ilegível não pode esconder as outras.
      continue;
    }
  }

  return [...porNome.values()].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
}

const HORIZON = process.env.STELLAR_HORIZON ?? "https://horizon-testnet.stellar.org";

/** Busca no Horizon e reduz. Conta sem histórico devolve lista vazia. */
export async function buscarOrganizacoes(
  fundador: string,
  registro: string,
): Promise<OrgDaCarteira[]> {
  const r = await fetch(
    `${HORIZON}/accounts/${fundador}/operations?limit=200&order=desc&include_failed=false`,
    { cache: "no-store" },
  );
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Horizon replied ${r.status}`);

  const corpo = await r.json();
  return organizacoesDe(corpo?._embedded?.records ?? [], registro);
}
