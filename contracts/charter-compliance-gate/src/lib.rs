#![no_std]
//! # ComplianceGate
//!
//! Policy do agente na camada pública. Implementa o trait `Policy` do
//! `stellar-accounts` e responde a duas perguntas que a `spending_limit` da
//! OpenZeppelin não responde:
//!
//! 1. **A função invocada está no escopo deste agente?** (`allowed_fns`)
//! 2. **A contraparte está verificada, quando o valor passa do limiar?**
//!    (consulta ao identity registry da suíte RWA)
//!
//! Também é o ponto de instrumentação: o `enforce` aprovado escreve
//! `AgentStats` e emite `PolicyDecision`. O caminho de recusa **não** grava
//! nada — `enforce` reprova via panic e a transação inteira reverte, levando
//! junto evento e estado. Por isso `ops_blocked` não existe aqui: a tentativa
//! recusada vive na rede como transação falhada, reconstruída pelo console.

use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    Address, Env, Symbol, Vec,
};
use stellar_accounts::{
    policies::Policy,
    smart_account::{ContextRule, Signer},
};

/// Interface do identity registry da suíte RWA da OpenZeppelin.
///
/// A função real **panica** quando a identidade não tem os claims exigidos —
/// não existe `is_verified(...) -> bool`. Quem precisa de um booleano usa o
/// `try_verify_identity` gerado pelo client.
#[contractclient(name = "IdentityVerifierClient")]
pub trait IdentityVerifier {
    fn verify_identity(e: &Env, account: Address);
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum GateError {
    /// A policy não está instalada para esta context rule.
    NotInstalled = 4000,
    /// A policy já está instalada para esta context rule.
    AlreadyInstalled = 4001,
    /// A função invocada não está no escopo deste agente.
    FunctionNotAllowed = 4002,
    /// Valor acima do limiar e contraparte sem claim válido.
    CounterpartyNotVerified = 4003,
    /// Invocação cuja forma não sabemos interpretar — recusada por princípio.
    UnsupportedInvocation = 4004,
    /// Nenhum signer autenticado.
    NoSigners = 4005,
}

/// Parâmetros de instalação, por context rule.
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
}

/// Conduta acumulada do agente. Escrita apenas no caminho aprovado.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentStats {
    pub ops_ok: u32,
    pub volume_total: i128,
    /// Volume movido para contrapartes verificadas — o número que a UI destaca,
    /// porque é o caro de inflar.
    pub volume_attested: i128,
    pub first_seen: u64,
}

#[contractevent]
pub struct PolicyDecision {
    #[topic]
    pub smart_account: Address,
    pub agent_label: Symbol,
    pub fn_name: Symbol,
    pub amount: i128,
    pub counterparty_verified: bool,
}

#[contracttype]
pub enum GateStorageKey {
    /// Parâmetros por (smart account, context rule).
    Params(Address, u32),
    /// Estatísticas por (smart account, context rule).
    Stats(Address, u32),
}

#[contract]
pub struct ComplianceGate;

#[contractimpl]
impl Policy for ComplianceGate {
    type AccountParams = GateParams;

    fn enforce(
        _e: &Env,
        _context: Context,
        _authenticated_signers: Vec<Signer>,
        _context_rule: ContextRule,
        _smart_account: Address,
    ) {
        todo!("fase 1")
    }

    fn install(
        _e: &Env,
        _install_params: Self::AccountParams,
        _context_rule: ContextRule,
        _smart_account: Address,
    ) {
        todo!("fase 1")
    }

    fn uninstall(_e: &Env, _context_rule: ContextRule, _smart_account: Address) {
        todo!("fase 1")
    }
}

#[contractimpl]
impl ComplianceGate {
    /// Conduta acumulada do agente — lida pela contraparte e pelo console.
    pub fn get_stats(_e: &Env, _context_rule_id: u32, _smart_account: Address) -> AgentStats {
        todo!("fase 1")
    }

    /// Parâmetros vigentes da procuração.
    pub fn get_params(_e: &Env, _context_rule_id: u32, _smart_account: Address) -> GateParams {
        todo!("fase 1")
    }
}

/// Extrai `(to, amount)` de uma invocação `transfer(from, to, amount)`.
///
/// Retorna `None` para qualquer outra forma — quem chama **deve** tratar isso
/// como recusa, nunca como "não se aplica". Essa é a diferença entre um gate e
/// uma decoração.
pub fn extract_transfer(_e: &Env, _ctx: &ContractContext) -> Option<(Address, i128)> {
    todo!("fase 1")
}

#[cfg(test)]
mod test;
