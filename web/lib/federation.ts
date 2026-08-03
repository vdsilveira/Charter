/**
 * SEP-2 Federation — o que torna `trader*alphafund` um endereço de verdade.
 *
 * Sem isto, o rótulo é um apelido que só o nosso app entende. Com isto,
 * qualquer carteira Stellar resolve `trader*dominio` para a conta corporativa e
 * paga o agente sem nunca ter ouvido falar do Charter.
 *
 * O formato de resposta é ditado pelo SEP-2. Inventar campos aqui não é
 * liberdade criativa: é tornar-se ilegível para quem consome.
 */

/**
 * Rótulo reservado que resolve para quem constituiu a organização.
 *
 * Existe porque o claim KYB é emitido para uma **pessoa**, e o selo
 * "organização verificada" lê o fundador — um endereço que ninguém decora.
 */
export const ROTULO_FUNDADOR = "founder";

export interface Consulta {
  q?: string | null;
  type?: string | null;
}

export interface Config {
  dominio: string;
  /** Organização servida por este domínio. */
  org: string;
  /** Resolve (org, rótulo) para o endereço que assina. */
  resolve: (org: string, label: string) => Promise<string | null>;
  /**
   * Resolve a organização para o endereço de quem a constituiu.
   *
   * Opcional: quem integrou antes de existir continua funcionando, e a consulta
   * apenas cai em 404 como qualquer rótulo desconhecido.
   */
  fundador?: (org: string) => Promise<string | null>;
}

export interface Resposta {
  status: number;
  body: Record<string, unknown>;
}

/**
 * `stellar.toml` publicado em `/.well-known/`.
 *
 * A passphrase não é decoração: sem ela a carteira não sabe em que rede o
 * endereço vale, e um endereço de testnet apresentado como mainnet é a receita
 * para dinheiro perdido.
 */
export function stellarToml({ dominio, rede }: { dominio: string; rede: string }): string {
  return `# Charter — organizações agentificadas na Stellar
VERSION="2.0.0"
NETWORK_PASSPHRASE="${rede}"
FEDERATION_SERVER="https://${dominio}/federation"

[DOCUMENTATION]
ORG_NAME="Charter"
ORG_DESCRIPTION="Constituição de organizações agentificadas: procuração programável, compliance verificável e liquidação confidencial."
ORG_URL="https://${dominio}"
`;
}

/**
 * Resolve um endereço federado.
 *
 * Aceita duas formas: `agente*dominio` (a organização vem da configuração) e
 * `agente*organizacao*dominio` (explícita). A segunda existe porque um mesmo
 * domínio pode um dia servir várias organizações — e mudar o formato depois
 * quebraria quem já integrou.
 *
 * O rótulo `founder` resolve para quem constituiu, quando nenhum agente tem
 * esse nome. Ver `ROTULO_FUNDADOR`.
 */
export async function resolverFederation(
  { q, type }: Consulta,
  { dominio, org, resolve, fundador }: Config,
): Promise<Resposta> {
  if (type !== "name") {
    return { status: 400, body: { detail: "apenas type=name é suportado por este servidor" } };
  }
  if (!q || !q.includes("*")) {
    return { status: 400, body: { detail: "endereço federado precisa da forma nome*domínio" } };
  }

  const partes = q.split("*");
  const dominioConsultado = partes[partes.length - 1];
  if (dominioConsultado !== dominio) {
    return { status: 404, body: { detail: "domínio não atendido por este servidor" } };
  }

  const label = partes[0];
  const organizacao = partes.length >= 3 ? partes[1] : org;

  let conta = await resolve(organizacao, label);

  // `founder` é convenção, não dado do registro — então perde para um agente de
  // mesmo nome. Quem batizou um agente assim espera resolver o agente.
  if (!conta && label === ROTULO_FUNDADOR && fundador) {
    conta = await fundador(organizacao);
  }

  if (!conta) {
    return { status: 404, body: { detail: "agente não encontrado" } };
  }

  return {
    status: 200,
    body: { stellar_address: q, account_id: conta },
  };
}
