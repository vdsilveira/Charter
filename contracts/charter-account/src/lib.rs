#![no_std]
//! # Charter Account
//!
//! Conta corporativa da organização. Difere do exemplo `multisig-account` da
//! OpenZeppelin em um ponto decisivo: a context rule é criada como
//! `ContextRuleType::CallContract(target)`, e não `Default`.
//!
//! Isso não é preferência — a policy `spending_limit` rejeita qualquer outro
//! tipo de regra com `OnlyCallContractAllowed` (erro 3227). Na prática, o teto
//! de gasto na Stellar é **sempre por contrato-alvo**: um agente que opera dois
//! ativos precisa de duas regras, com dois tetos independentes.

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

#[contract]
pub struct CharterAccount;

#[contractimpl]
impl CharterAccount {
    /// Cria a procuração de um agente, escopada a um contrato-alvo.
    ///
    /// # Argumentos
    ///
    /// * `target` - contrato que o agente pode invocar (ex.: o SAC do ativo)
    /// * `label` - nome da regra, usado como rótulo do agente (ex.: "trader")
    /// * `valid_until` - ledger de expiração da procuração; `None` = sem prazo
    /// * `signers` - chaves que autorizam em nome do agente
    /// * `policies` - mapa policy → parâmetros de instalação
    pub fn __constructor(
        e: &Env,
        target: Address,
        label: String,
        valid_until: Option<u32>,
        signers: Vec<Signer>,
        policies: Map<Address, Val>,
    ) {
        smart_account::add_context_rule(
            e,
            &ContextRuleType::CallContract(target),
            &label,
            valid_until,
            &signers,
            &policies,
        );
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
