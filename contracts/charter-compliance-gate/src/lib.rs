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
    panic_with_error, symbol_short, Address, Env, Symbol, TryFromVal, Vec,
};
use stellar_accounts::{
    policies::Policy,
    smart_account::{ContextRule, Signer},
};

pub use charter_types::{AgentStats, GateParams};

/// TTL das entradas persistentes: ~30 dias em ledgers, renovado a cada
/// operação aprovada. Uma demo não pode perder a procuração por archival.
const TTL_THRESHOLD: u32 = 60 * 60 * 24 / 5 * 15; // ~15 dias
const TTL_EXTEND: u32 = 60 * 60 * 24 / 5 * 30; // ~30 dias

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
    /// A operação levaria o agente acima do teto acumulado da procuração.
    CapExceeded = 4006,
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
        e: &Env,
        context: Context,
        authenticated_signers: Vec<Signer>,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();

        if authenticated_signers.is_empty() {
            panic_with_error!(e, GateError::NoSigners);
        }

        let params = load_params(e, &smart_account, context_rule.id);

        // Só invocação de contrato é interpretável. Criação de contrato e
        // qualquer outra forma são recusadas: não sabemos o que autorizam.
        let Context::Contract(cc) = context else {
            panic_with_error!(e, GateError::UnsupportedInvocation);
        };

        if !params.allowed_fns.contains(&cc.fn_name) {
            panic_with_error!(e, GateError::FunctionNotAllowed);
        }

        // A allow-list passou, mas ainda precisamos entender o valor movido.
        // Não entender é motivo de recusa, nunca de liberação.
        let Some((to, amount)) = extract_transfer(e, &cc) else {
            panic_with_error!(e, GateError::UnsupportedInvocation);
        };

        // Consultamos o registry mesmo abaixo do limiar: acima dele o claim é
        // condição para passar; abaixo, decide apenas se o valor entra em
        // `volume_attested`. Uma chamada, dois usos.
        let verified = is_verified(e, &params.identity_registry, &to);

        if amount > params.kyb_threshold && !verified {
            panic_with_error!(e, GateError::CounterpartyNotVerified);
        }

        let mut stats = load_stats(e, &smart_account, context_rule.id);

        // Teto acumulado: é o que limita o estrago de um agente comprometido.
        // `kyb_threshold` diz de quem se exige identidade; isto diz quanto se
        // pode mover, somando tudo o que já se moveu.
        if let Some(teto) = params.max_volume {
            if stats.volume_total + amount > teto {
                panic_with_error!(e, GateError::CapExceeded);
            }
        }

        stats.ops_ok += 1;
        stats.volume_total += amount;
        if verified {
            stats.volume_attested += amount;
        }
        save_stats(e, &smart_account, context_rule.id, &stats);

        PolicyDecision {
            smart_account,
            agent_label: params.agent_label,
            fn_name: cc.fn_name,
            amount,
            counterparty_verified: verified,
        }
        .publish(e);
    }

    fn install(
        e: &Env,
        install_params: Self::AccountParams,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();

        let key = GateStorageKey::Params(smart_account.clone(), context_rule.id);
        if e.storage().persistent().has(&key) {
            panic_with_error!(e, GateError::AlreadyInstalled);
        }
        e.storage().persistent().set(&key, &install_params);

        save_stats(e, &smart_account, context_rule.id, &AgentStats::new(e));
    }

    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();

        let key = GateStorageKey::Params(smart_account.clone(), context_rule.id);
        if !e.storage().persistent().has(&key) {
            panic_with_error!(e, GateError::NotInstalled);
        }
        e.storage().persistent().remove(&key);
        e.storage()
            .persistent()
            .remove(&GateStorageKey::Stats(smart_account, context_rule.id));
    }
}

/// Quem administra a conta corporativa. A conta responde por si mesma.
#[contractclient(name = "ContaClient")]
pub trait ContaComGestor {
    fn gestor(e: &Env) -> Address;
}

#[contractimpl]
impl ComplianceGate {
    /// Altera o teto acumulado de uma procuração.
    ///
    /// A autorização vem do **gestor da conta** — o registro que a implantou —,
    /// e o gate descobre quem é perguntando à própria conta. Contrato para
    /// contrato: o registro é o chamador direto, e nada disso passa pelo
    /// `__check_auth`, que é o caminho que a rede recusa.
    ///
    /// Quem decide continua sendo o fundador: o registro exige a assinatura
    /// dele na raiz antes de chegar aqui.
    pub fn set_max_volume(
        e: &Env,
        context_rule_id: u32,
        smart_account: Address,
        max_volume: Option<i128>,
    ) {
        ContaClient::new(e, &smart_account).gestor().require_auth();

        let key = GateStorageKey::Params(smart_account.clone(), context_rule_id);
        let mut params: GateParams = match e.storage().persistent().get(&key) {
            Some(p) => p,
            None => panic_with_error!(e, GateError::NotInstalled),
        };

        params.max_volume = max_volume;
        e.storage().persistent().set(&key, &params);
    }

    /// Conduta acumulada do agente — lida pela contraparte e pelo console.
    pub fn get_stats(e: &Env, context_rule_id: u32, smart_account: Address) -> AgentStats {
        load_stats(e, &smart_account, context_rule_id)
    }

    /// Parâmetros vigentes da procuração.
    pub fn get_params(e: &Env, context_rule_id: u32, smart_account: Address) -> GateParams {
        load_params(e, &smart_account, context_rule_id)
    }
}

/// Extrai `(to, amount)` de uma invocação `transfer(from, to, amount)`.
///
/// Retorna `None` para qualquer outra forma — quem chama **deve** tratar isso
/// como recusa, nunca como "não se aplica". Essa é a diferença entre um gate e
/// uma decoração.
pub fn extract_transfer(e: &Env, ctx: &ContractContext) -> Option<(Address, i128)> {
    if ctx.fn_name != symbol_short!("transfer") || ctx.args.len() != 3 {
        return None;
    }
    let to = Address::try_from_val(e, &ctx.args.get(1)?).ok()?;
    let amount = i128::try_from_val(e, &ctx.args.get(2)?).ok()?;
    if amount < 0 {
        return None;
    }
    Some((to, amount))
}

/// Converte o `verify_identity` da OZ — que panica — em booleano.
/// Fail-closed: qualquer erro vira `false`.
fn is_verified(e: &Env, registry: &Address, account: &Address) -> bool {
    IdentityVerifierClient::new(e, registry).try_verify_identity(account).is_ok()
}

fn load_params(e: &Env, smart_account: &Address, rule_id: u32) -> GateParams {
    let key = GateStorageKey::Params(smart_account.clone(), rule_id);
    match e.storage().persistent().get::<_, GateParams>(&key) {
        Some(p) => {
            e.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
            p
        }
        None => panic_with_error!(e, GateError::NotInstalled),
    }
}

fn load_stats(e: &Env, smart_account: &Address, rule_id: u32) -> AgentStats {
    let key = GateStorageKey::Stats(smart_account.clone(), rule_id);
    e.storage().persistent().get(&key).unwrap_or(AgentStats::new(e))
}

fn save_stats(e: &Env, smart_account: &Address, rule_id: u32, stats: &AgentStats) {
    let key = GateStorageKey::Stats(smart_account.clone(), rule_id);
    e.storage().persistent().set(&key, stats);
    e.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

#[cfg(test)]
mod test;
