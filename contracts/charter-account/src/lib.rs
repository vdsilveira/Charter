#![no_std]
//! # CharterAccount
//!
//! Conta corporativa da organização: um tesouro, várias procurações.
//!
//! Cada agente vira uma `ContextRule` do tipo `CallContract(target)`, com seus
//! próprios signers, prazo e policies. O tipo não é escolha de estilo — a
//! `spending_limit` da OpenZeppelin recusa qualquer outro com
//! `OnlyCallContractAllowed` (erro 3227), e é por isso que o exemplo
//! `multisig-account` da OZ, que cria a regra como `Default`, não serve aqui.
//!
//! Consequência de desenho: **o teto de gasto é por contrato-alvo, não por
//! agente**. Um agente que opera dois ativos precisa de duas regras, com dois
//! tetos independentes.

// Address/Map/String/Val/Symbol/BytesN e ContextRule aparecem apenas nas
// assinaturas que os macros `contracttrait` expandem — sem eles no escopo, a
// expansão não compila.
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl,
    crypto::Hash,
    panic_with_error, Address, Env, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{
    self, AuthPayload, ContextRule, ContextRuleType, ExecutionEntryPoint, Signer, SmartAccount,
    SmartAccountError,
};

pub use charter_types::AgentRule;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AccountError {
    /// Conta sem nenhuma procuração — não teria como autorizar nada.
    NoAgents = 6000,
}

#[contract]
pub struct CharterAccount;

#[contractimpl]
impl CharterAccount {
    /// Constitui a conta com uma procuração por agente, em uma transação.
    ///
    /// A ordem de `agents` determina os `context_rule_id` (0, 1, 2, …), e é
    /// dela que o `OrgRegistry` depende para ligar rótulo a regra.
    pub fn __constructor(e: &Env, agents: Vec<AgentRule>) {
        if agents.is_empty() {
            panic_with_error!(e, AccountError::NoAgents);
        }

        for agent in agents.iter() {
            smart_account::add_context_rule(
                e,
                &ContextRuleType::CallContract(agent.target),
                &agent.label,
                agent.valid_until,
                &agent.signers,
                &agent.policies,
            );
        }
    }
}

#[contractimpl]
impl CustomAccountInterface for CharterAccount {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        smart_account::do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

#[contractimpl(contracttrait)]
impl SmartAccount for CharterAccount {}

#[contractimpl(contracttrait)]
impl ExecutionEntryPoint for CharterAccount {}

#[cfg(test)]
mod test;
