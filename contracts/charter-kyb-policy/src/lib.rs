#![no_std]
//! # KybPolicy
//!
//! Gate de identidade da **camada confidencial**. É a peça que estende o
//! registro de identidade ao espaço privado — e, com isso, faz o mesmo registro
//! governar as três camadas do Charter.
//!
//! O token confidencial da OpenZeppelin aceita
//! `ComplianceConfig { policy: Option<Address>, sac_passthrough: bool }` e
//! invoca, em **toda** operação que muda estado, para **cada conta nomeada**:
//!
//! ```rust,ignore
//! fn is_authorized(e: Env, account: Address, token: Address) -> bool;
//! ```
//!
//! ## Por que não basta repassar a chamada
//!
//! A interface real do identity registry é `verify_identity(account)`, que
//! **panica** quando a identidade não tem os claims exigidos — não existe um
//! `is_verified(...) -> bool`. Se propagássemos o panic, a operação confidencial
//! abortaria com um erro do registry em vez de um `false` limpo, e o token não
//! conseguiria distinguir "não autorizado" de "gate quebrado". Por isso usamos
//! `try_verify_identity` e convertemos o resultado em booleano.
//!
//! ## Fail-closed
//!
//! Qualquer resultado que não seja uma verificação bem-sucedida vira `false`:
//! claim ausente, claim revogado, registry inacessível ou erro inesperado. Um
//! gate que responde `true` quando não conseguiu verificar não é um gate.

use soroban_sdk::{contract, contractclient, contractimpl, contracttype, Address, Env};

/// Interface do identity registry da suíte RWA da OpenZeppelin.
#[contractclient(name = "IdentityVerifierClient")]
pub trait IdentityVerifier {
    fn verify_identity(e: &Env, account: Address);
}

#[contracttype]
pub enum KybStorageKey {
    /// Identity registry consultado por este gate.
    Registry,
    /// Tópico de claim exigido (ex.: KYB).
    ClaimTopic,
}

#[contract]
pub struct KybPolicy;

#[contractimpl]
impl KybPolicy {
    pub fn __constructor(_e: &Env, _identity_registry: Address, _claim_topic: u32) {
        todo!("fase 4")
    }

    /// Chamado pelo token confidencial em toda operação, para cada conta
    /// nomeada. **Nunca panica** — o token espera um booleano.
    pub fn is_authorized(_e: &Env, _account: Address, _token: Address) -> bool {
        todo!("fase 4")
    }

    pub fn identity_registry(_e: &Env) -> Address {
        todo!("fase 4")
    }
}

#[cfg(test)]
mod test;
