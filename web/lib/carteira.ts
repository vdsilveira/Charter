/**
 * Carteira do administrador: validação de rede e assinatura.
 *
 * A rede é verificada **antes** de pedir a assinatura. Assinar em mainnet uma
 * transação destinada à testnet é um erro que só aparece depois, e com dinheiro
 * de verdade do outro lado — barrar na origem custa uma linha.
 */

/** Superfície do Freighter que usamos. Injetável para teste. */
export interface FreighterApi {
  isConnected: () => Promise<{ isConnected: boolean }>;
  requestAccess?: () => Promise<{ address?: string; error?: string }>;
  /** Endereço vazio significa: instalado, mas sem permissão para este site. */
  getAddress?: () => Promise<{ address?: string; error?: string }>;
  getNetwork?: () => Promise<{ network?: string; networkPassphrase?: string; error?: string }>;
  signTransaction?: (
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string },
  ) => Promise<{ signedTxXdr?: string; error?: string }>;
}

export const PASSPHRASE_TESTNET = "Test SDF Network ; September 2015";

export function redeCorreta(rede: string | undefined | null): boolean {
  return rede === "TESTNET";
}

/** Carrega o Freighter de verdade quando nenhum foi injetado. */
export async function freighter(api?: FreighterApi): Promise<FreighterApi> {
  return api ?? ((await import("@stellar/freighter-api")) as unknown as FreighterApi);
}

export interface AssinarParams {
  xdr: string;
  endereco: string;
  api?: FreighterApi;
  enviar: (xdrAssinado: string) => Promise<{ hash: string }>;
}

/**
 * Pede assinatura à carteira e entrega o resultado a quem envia.
 *
 * Recusa do usuário **não** vira transação enviada: a função lança, e quem
 * chama mostra o aviso. Um catch silencioso aqui produziria a pior combinação
 * possível — o usuário achando que cancelou e a rede achando que não.
 */
export async function assinarEEnviar({ xdr, endereco, api, enviar }: AssinarParams) {
  const wallet = await freighter(api);

  const { network } = (await wallet.getNetwork?.()) ?? {};
  if (!redeCorreta(network)) {
    throw new Error(
      `A carteira está em ${network ?? "rede desconhecida"}. Troque para testnet antes de assinar.`,
    );
  }

  const { signedTxXdr, error } =
    (await wallet.signTransaction?.(xdr, {
      networkPassphrase: PASSPHRASE_TESTNET,
      address: endereco,
    })) ?? {};

  if (error || !signedTxXdr) throw new Error(error ?? "assinatura recusada na carteira");
  return enviar(signedTxXdr);
}
