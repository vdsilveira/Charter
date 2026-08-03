/**
 * XLM ↔ stroops.
 *
 * Quem digita pensa em XLM; a cadeia conta em stroops (1 XLM = 10 000 000).
 * A conversão parece trivial e não é: `Number("8.1") * 1e7` devolve
 * `81000000.00000001`, e arredondar o resto é como se perde ou se cria dinheiro
 * sem ninguém notar. A conta aqui é feita em texto, sem ponto flutuante no
 * caminho.
 */

const CASAS = 7;

/**
 * XLM digitado → stroops.
 *
 * Lança em vez de arredondar. Aceitar `0.00000001` e truncar seria pior que
 * recusar: o usuário veria um valor na tela e enviaria outro.
 */
export function paraStroops(xlm: string): string {
  const texto = String(xlm ?? "").trim();

  // O sinal entra no formato aceito de propósito: quem digitou "-5" digitou um
  // número, e merece "o valor precisa ser positivo" em vez de "não parece um
  // número".
  if (!/^-?\d+(\.\d+)?$/.test(texto)) {
    throw new Error("Enter an amount in XLM, like 10 or 2.5.");
  }

  const negativo = texto.startsWith("-");
  const [inteira, fracao = ""] = texto.replace("-", "").split(".");
  if (fracao.length > CASAS) {
    throw new Error(`XLM has at most ${CASAS} decimal places.`);
  }

  const stroops = BigInt(inteira + fracao.padEnd(CASAS, "0"));
  if (negativo || stroops <= 0n) throw new Error("Amount must be positive.");

  return stroops.toString();
}

/** Stroops → XLM legível, sem zeros à toa. */
export function emXlm(stroops: string | bigint): string {
  const v = BigInt(stroops);
  const sinal = v < 0n ? "-" : "";
  const abs = v < 0n ? -v : v;

  const base = 10n ** BigInt(CASAS);
  const inteira = abs / base;
  const fracao = (abs % base).toString().padStart(CASAS, "0").replace(/0+$/, "");

  return `${sinal}${inteira}${fracao ? `.${fracao}` : ""}`;
}
