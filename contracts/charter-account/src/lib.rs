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
//!
//! A regra 0 é sempre a do **administrador**, com `Signer::Delegated(admin)` e
//! escopo na própria conta. É ela que permite ao fundador adicionar e remover
//! agentes assinando com a própria carteira: sem ela, administrar exigiria que
//! um agente já existente assinasse a mudança — o ovo antes da galinha. O
//! escopo na própria conta é deliberado: o administrador governa a
//! organização, mas não ganha uma via livre para o tesouro.

// Address/Map/String/Val/Symbol/BytesN e ContextRule aparecem apenas nas
// assinaturas que os macros `contracttrait` expandem — sem eles no escopo, a
// expansão não compila.
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Address, Env, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{
    self, AuthPayload, ContextRule, ContextRuleType, ExecutionEntryPoint, Signer, SmartAccount,
    SmartAccountError,
};

pub use charter_types::AgentRule;

/// Nome da regra do administrador. O `OrgRegistry` conta com ela na posição 0.
pub const REGRA_ADMIN: &str = "admin";

#[contract]
pub struct CharterAccount;

#[contractimpl]
impl CharterAccount {
    /// Constitui a conta: a regra do administrador e uma procuração por agente.
    ///
    /// A regra do administrador ocupa o índice 0; os agentes seguem na ordem de
    /// `agents`, a partir de 1. É dessa ordem que o `OrgRegistry` depende para
    /// ligar rótulo a procuração.
    pub fn __constructor(e: &Env, admin: Address, agents: Vec<AgentRule>) {
        smart_account::add_context_rule(
            e,
            &ContextRuleType::CallContract(e.current_contract_address()),
            &String::from_str(e, REGRA_ADMIN),
            None,
            &Vec::from_array(e, [Signer::Delegated(admin)]),
            &Map::new(e),
        );

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
