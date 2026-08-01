/**
 * Tradução dos códigos de erro de contrato para linguagem de operador.
 *
 * "Error(Contract, #4003)" não diz nada a quem opera a organização — e é
 * justamente nos caminhos de recusa que a interface precisa ser mais clara,
 * porque recusa é o comportamento que o produto promete.
 */
const MENSAGENS: Record<number, string> = {
  // ComplianceGate (nosso)
  4000: "A procuração deste agente não está instalada.",
  4001: "Esta procuração já estava instalada.",
  4002: "Esta função está fora do escopo do agente.",
  4003: "A contraparte não está verificada — acima do limiar é preciso claim KYB válido.",
  4004: "Operação em formato que a política não sabe interpretar; recusada por segurança.",
  4005: "Nenhum signatário autenticado.",
  // spending_limit (OpenZeppelin)
  3221: "Valor acima da cota do agente no período.",
  3223: "A política não autoriza este tipo de operação.",
  3227: "A regra precisa ser escopada a um contrato-alvo.",
  // OrgRegistry (nosso)
  5000: "Já existe uma organização com esse nome.",
  5001: "Organização não encontrada.",
  5002: "Agente não encontrado nesta organização.",
  5003: "Agente revogado.",
  5004: "Só o fundador administra a própria organização.",
  5005: "A organização precisa de ao menos um agente.",
  // Confidential / RWA
  3602: "A contraparte não está autorizada pela política de identidade.",
  321: "A conta não tem identidade registrada — falta claim KYB.",
  302: "Conta congelada pelo emissor.",
};

export function codigoDoErro(erro: unknown): number | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(String((erro as Error)?.message ?? erro ?? ""));
  return m ? Number(m[1]) : null;
}

export function traduzirErro(erro: unknown): string {
  const codigo = codigoDoErro(erro);
  if (codigo && MENSAGENS[codigo]) return MENSAGENS[codigo];
  const texto = String((erro as Error)?.message ?? erro ?? "");
  return texto || "Não foi possível completar a operação.";
}
