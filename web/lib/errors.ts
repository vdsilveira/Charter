/**
 * Tradução dos códigos de erro de contrato para linguagem de operador.
 *
 * "Error(Contract, #4003)" não diz nada a quem opera a organização — e é
 * justamente nos caminhos de recusa que a interface precisa ser mais clara,
 * porque recusa é o comportamento que o produto promete.
 */
const MENSAGENS: Record<number, string> = {
  // ComplianceGate (nosso)
  4000: "This agent's power of attorney is not installed.",
  4001: "This power of attorney was already installed.",
  4002: "This function is outside the agent's scope.",
  4003: "The counterparty is not verified — above the threshold a valid KYB claim is required.",
  4004: "Operation in a shape the policy cannot interpret; refused for safety.",
  4005: "No authenticated signer.",
  // spending_limit (OpenZeppelin)
  3221: "Amount above the agent's quota for the period.",
  3223: "The policy does not authorize this kind of operation.",
  3227: "The rule must be scoped to a target contract.",
  // OrgRegistry (nosso)
  5000: "An organization with that name already exists.",
  5001: "Organization not found.",
  5002: "Agent not found in this organization.",
  5003: "Agent revoked.",
  5004: "Only the founder administers their own organization.",
  5005: "An organization needs at least one agent.",
  // Confidential / RWA
  3602: "The counterparty is not authorized by the identity policy.",
  321: "The account has no registered identity — a KYB claim is missing.",
  302: "Account frozen by the issuer.",
};

export function codigoDoErro(erro: unknown): number | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(String((erro as Error)?.message ?? erro ?? ""));
  return m ? Number(m[1]) : null;
}

export function traduzirErro(erro: unknown): string {
  const codigo = codigoDoErro(erro);
  if (codigo && MENSAGENS[codigo]) return MENSAGENS[codigo];
  const texto = String((erro as Error)?.message ?? erro ?? "");
  return texto || "Could not complete the operation.";
}
