/**
 * Folha confidencial — a organização paga com o valor oculto.
 *
 * Na rede fica visível **quem pagou quem**; quanto, não. Quem tem a chave de
 * visão — o destinatário — e o auditor designado leem o valor; mais ninguém. É
 * o oposto do x402, que exige valor público para o vendedor conferir que
 * recebeu o preço, e por isso os dois fluxos não se misturam.
 *
 * ## Por que um processo separado
 *
 * A prova carrega wasm do disco e usa worker threads. O bundler do Next
 * transforma o `.wasm` em URL estática e o Node tenta buscá-la como HTTP —
 * `Failed to parse URL from /_next/static/media/…` — ou simplesmente não a
 * copia. Marcar os pacotes como externos não bastou: a cadeia de transitivas do
 * Noir volta a ser empacotada por outro caminho.
 *
 * Um processo separado resolve as duas coisas e ainda garante que os worker
 * threads morram junto com ele. Vale mais que insistir com o empacotador.
 *
 * ## Por que a chave vive no servidor
 *
 * A chave de gasto confidencial deriva do **segredo da conta**, e o Freighter
 * não expõe segredo. Na demo o tesouro confidencial é uma chave do servidor,
 * como o patrocinador — e a tela diz isso, em vez de dar a entender que a
 * carteira do fundador assinou.
 */
import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "path";

const executar = promisify(execFile);

/** Uma prova leva segundos; o teto evita processo pendurado para sempre. */
const LIMITE_MS = 240_000;

/**
 * Chama o script e devolve o JSON que ele imprime.
 *
 * O script sempre escreve uma linha JSON, inclusive no erro — assim a mensagem
 * chega à tela em vez de virar "exit code 1", que não diz nada a quem opera.
 */
async function confidencial<T>(...args: string[]): Promise<T> {
  const raiz = join(process.cwd(), "..");
  try {
    const { stdout } = await executar("node", [join(raiz, "scripts", "confidencial.mjs"), ...args], {
      cwd: raiz,
      timeout: LIMITE_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
    return JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}") as T;
  } catch (e) {
    const saida = (e as { stdout?: string }).stdout?.trim().split("\n").at(-1);
    if (saida) {
      try {
        const corpo = JSON.parse(saida) as { error?: string };
        if (corpo?.error) throw new Error(corpo.error);
      } catch (parse) {
        if (parse instanceof Error && parse.message !== saida) throw parse;
      }
    }
    throw new Error(String((e as Error).message ?? e).split("\n")[0]);
  }
}

export interface SaldoConfidencial {
  /** Saldo gastável, legível só por quem tem a chave. */
  gastavel: string;
  tesouro: string;
  token: string;
}

export async function saldoConfidencial(): Promise<SaldoConfidencial> {
  return confidencial<SaldoConfidencial>("saldo");
}

export interface Pagamento {
  hash: string;
  para: string;
  /** Fica **fora** da cadeia — só aqui, para a tela confirmar o que foi pedido. */
  valor: string;
}

export async function pagarConfidencial(para: string, valor: string): Promise<Pagamento> {
  return confidencial<Pagamento>("pagar", para, valor);
}
