/**
 * Endereço de destino: cru ou federado.
 *
 * O nome se resolve **antes** de montar a transação, e o que segue para a
 * carteira e para a cadeia é sempre o endereço. Não é conveniência de
 * implementação: contrato Soroban não entende nome, então mandar um significaria
 * alguém traduzindo por dentro, e quem assina não veria para onde o valor vai.
 *
 * Daí a função devolver o endereço para a tela mostrar antes de assinar.
 */
import { StrKey } from "@stellar/stellar-sdk";

/** `algo*organização*domínio` — a forma federada do SEP-2. */
export function pareceFederado(valor: string): boolean {
  return valor.includes("*");
}

function ehEndereco(valor: string): boolean {
  // Conta (`G…`) ou contrato (`C…`): a conta corporativa de uma organização é
  // um contrato, e pagar a um agente significa pagar a ela.
  return StrKey.isValidEd25519PublicKey(valor) || StrKey.isValidContract(valor);
}

/**
 * Devolve o endereço para onde a transação vai de fato.
 *
 * `buscar` é injetável para teste; em produção é o `fetch` do browser contra o
 * nosso próprio servidor de federation.
 */
export async function resolverEndereco(
  valor: string,
  buscar: typeof fetch = fetch,
): Promise<string> {
  const texto = String(valor ?? "").trim();

  if (ehEndereco(texto)) return texto;

  if (!pareceFederado(texto)) {
    throw new Error("Enter a Stellar address or a federated name like agent*org*domain.");
  }

  const r = await buscar(`/federation?q=${encodeURIComponent(texto)}&type=name`);
  const corpo = await r.json();
  if (!r.ok) throw new Error(corpo?.detail ?? "federated name not found");

  const encontrado = String(corpo?.account_id ?? "").trim();
  if (!ehEndereco(encontrado)) {
    // Aceitar o que veio mandaria a transação para um destino sem sentido, e o
    // erro só apareceria na assinatura.
    throw new Error("federation returned something that is not a Stellar address");
  }

  return encontrado;
}
