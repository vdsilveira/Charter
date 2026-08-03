#![no_std]
//! Tipos compartilhados entre os contratos do Charter.
//!
//! Existe para que `charter-account`, `charter-compliance-gate` e
//! `charter-org-registry` falem exatamente a mesma linguagem. Structs
//! duplicadas entre contratos que trocam dados são uma fonte silenciosa de bug:
//! o layout XDR diverge e a chamada cross-contract falha de formas difíceis de
//! ler.

use soroban_sdk::{contracttype, Address, Env, Map, String, Symbol, Val, Vec};
use stellar_accounts::smart_account::Signer;

/// Procuração de um agente, como declarada na constituição da organização.
///
/// Vira uma `ContextRule` do tipo `CallContract` dentro da conta corporativa.
/// O tipo é obrigatório: a `spending_limit` da OpenZeppelin recusa qualquer
/// outro com `OnlyCallContractAllowed` (3227).
#[contracttype]
#[derive(Clone)]
pub struct AgentRule {
    /// Rótulo do agente na organização (ex.: "trader").
    pub label: String,
    /// Contrato que este agente pode invocar — normalmente o SAC do ativo.
    /// O teto de gasto é sempre por alvo, nunca global.
    pub target: Address,
    /// Ledger de expiração da procuração; `None` = sem prazo.
    pub valid_until: Option<u32>,
    /// Chaves que autorizam em nome do agente.
    pub signers: Vec<Signer>,
    /// Policies a instalar, com seus parâmetros.
    pub policies: Map<Address, Val>,
}

/// Parâmetros do `ComplianceGate`, por context rule.
#[contracttype]
#[derive(Clone)]
pub struct GateParams {
    /// Funções que este agente pode invocar. `["transfer"]` para o trader;
    /// vazio para um agente somente-leitura.
    pub allowed_fns: Vec<Symbol>,
    /// Acima deste valor, a contraparte precisa de claim válido.
    pub kyb_threshold: i128,
    /// Identity registry consultado no `enforce`.
    pub identity_registry: Address,
    /// Tópico do claim exigido (ex.: KYB).
    pub claim_topic: u32,
    /// Rótulo do agente, para atribuir as estatísticas.
    pub agent_label: Symbol,
    /// Teto **acumulado** que este agente pode mover, em toda a sua vida.
    ///
    /// `None` é sem teto — que é o que as procurações antigas eram, e continua
    /// sendo o padrão de quem não escolher. Existe para limitar o estrago de um
    /// agente comprometido: `kyb_threshold` diz de quem se exige identidade,
    /// nunca quanto se pode gastar.
    pub max_volume: Option<i128>,
}

/// Conduta acumulada do agente. Escrita apenas no caminho aprovado — o de
/// recusa reverte a transação e não grava nada.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentStats {
    pub ops_ok: u32,
    pub volume_total: i128,
    /// Volume movido para contrapartes verificadas — o número que a UI
    /// destaca, porque é o caro de inflar.
    pub volume_attested: i128,
    pub first_seen: u64,
}

impl AgentStats {
    pub fn new(e: &Env) -> Self {
        Self { ops_ok: 0, volume_total: 0, volume_attested: 0, first_seen: e.ledger().timestamp() }
    }
}

/// Registro de um agente dentro da organização.
#[contracttype]
#[derive(Clone)]
pub struct AgentRecord {
    pub label: Symbol,
    /// `ContextRule` correspondente dentro da conta corporativa.
    pub context_rule_id: u32,
    /// Policy que guarda escopo e estatísticas deste agente.
    pub gate: Address,
    /// Revogação registrada pelo fundador. Ver a nota sobre o alcance da
    /// revogação em `charter-org-registry`.
    pub active: bool,
}

/// Organização constituída.
#[contracttype]
#[derive(Clone)]
pub struct OrgInfo {
    pub name: Symbol,
    pub founder: Address,
    /// Conta corporativa — quem de fato assina e detém o tesouro.
    pub account: Address,
    pub agents: Vec<Symbol>,
}

/// Resposta de `credentials_of`: o que uma contraparte precisa saber antes de
/// negociar, em uma única leitura.
#[contracttype]
#[derive(Clone)]
pub struct AgentCredentials {
    pub org: Symbol,
    pub label: Symbol,
    /// Conta que assina — é ela que aparece como remetente na rede.
    pub account: Address,
    pub active: bool,
    /// Escopo e limiar vigentes.
    pub params: GateParams,
    /// Conduta acumulada.
    pub stats: AgentStats,
    /// A organização (na pessoa do fundador) tem claim válido.
    pub org_verified: bool,
}
