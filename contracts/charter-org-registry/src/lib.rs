#![no_std]
//! # OrgRegistry
//!
//! O cartório: constitui a organização em uma transação e responde, para quem
//! nunca a viu, quem são seus agentes e o que cada um pode fazer.
//!
//! `create_org` faz o deploy da conta corporativa com uma procuração por
//! agente e registra os rótulos. `credentials_of` devolve, em **uma leitura**,
//! o que uma contraparte precisa para decidir se negocia: escopo, limiar,
//! conduta e se a organização tem claim válido.
//!
//! ## Sobre o alcance de `revoke_agent`
//!
//! A revogação registrada aqui torna o agente inativo na **credencial
//! pública** — `resolve` passa a falhar e `credentials_of` marca `active:
//! false`. Ela **não** remove a context rule dentro da conta corporativa, o que
//! exigiria autorização da própria conta (seus signers). Enquanto a regra
//! existir, o agente segue autorizado on-chain dentro dos limites dela.
//!
//! A revogação com efeito imediato na rede se faz de duas outras formas, e o
//! console deve oferecê-las: definir `valid_until` na procuração, ou revogar o
//! claim da contraparte no identity registry — este último recusa a operação
//! seguinte sem tocar em contrato nenhum.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error,
    xdr::ToXdr, Address, BytesN, Env, Symbol, Vec,
};

pub use charter_types::{AgentCredentials, AgentRecord, AgentRule, AgentStats, GateParams, OrgInfo};

#[contractclient(name = "GateClient")]
pub trait Gate {
    fn get_params(e: &Env, context_rule_id: u32, smart_account: Address) -> GateParams;
    fn get_stats(e: &Env, context_rule_id: u32, smart_account: Address) -> AgentStats;
}

#[contractclient(name = "IdentityVerifierClient")]
pub trait IdentityVerifier {
    fn verify_identity(e: &Env, account: Address);
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RegistryError {
    /// Já existe organização com este nome. Nomes são únicos e imutáveis.
    NameTaken = 5000,
    /// Organização não encontrada.
    OrgNotFound = 5001,
    /// Agente não encontrado nesta organização.
    AgentNotFound = 5002,
    /// Agente revogado — `resolve` falha em vez de devolver endereço obsoleto.
    AgentRevoked = 5003,
    /// Só o fundador administra a própria organização.
    NotFounder = 5004,
    /// Constituição sem agentes.
    NoAgents = 5005,
}

#[contracttype]
pub enum RegistryStorageKey {
    /// Wasm da conta corporativa, usado em todo `create_org`.
    AccountWasm,
    /// Identity verifier consultado por `credentials_of`.
    Verifier,
    Org(Symbol),
    Agent(Symbol, Symbol),
}

#[contract]
pub struct OrgRegistry;

#[contractimpl]
impl OrgRegistry {
    pub fn __constructor(e: &Env, account_wasm_hash: BytesN<32>, identity_verifier: Address) {
        e.storage().instance().set(&RegistryStorageKey::AccountWasm, &account_wasm_hash);
        e.storage().instance().set(&RegistryStorageKey::Verifier, &identity_verifier);
    }

    /// Constitui a organização: deploy da conta corporativa com uma procuração
    /// por agente, registro dos rótulos e do fundador — tudo em uma transação.
    pub fn create_org(
        e: &Env,
        name: Symbol,
        founder: Address,
        gate: Address,
        agents: Vec<AgentRule>,
    ) -> Address {
        founder.require_auth();

        if agents.is_empty() {
            panic_with_error!(e, RegistryError::NoAgents);
        }
        if e.storage().persistent().has(&RegistryStorageKey::Org(name.clone())) {
            panic_with_error!(e, RegistryError::NameTaken);
        }

        let wasm: BytesN<32> =
            e.storage().instance().get(&RegistryStorageKey::AccountWasm).unwrap();

        // O nome da organização determina o endereço da conta: mesma
        // constituição, mesmo endereço, e nomes únicos por construção.
        let salt: BytesN<32> = e.crypto().sha256(&name.clone().to_xdr(e)).into();
        let account = e
            .deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm, (agents.clone(),));

        let mut labels = Vec::new(e);
        // O índice é o `context_rule_id`: a conta cria as regras na ordem de
        // `agents`, e é essa ordem que liga rótulo a procuração.
        for (i, agent) in agents.iter().enumerate() {
            let label = label_to_symbol(e, &agent.label);
            labels.push_back(label.clone());
            e.storage().persistent().set(
                &RegistryStorageKey::Agent(name.clone(), label.clone()),
                &AgentRecord {
                    label,
                    context_rule_id: i as u32,
                    gate: gate.clone(),
                    active: true,
                },
            );
        }

        e.storage().persistent().set(
            &RegistryStorageKey::Org(name.clone()),
            &OrgInfo { name, founder, account: account.clone(), agents: labels },
        );

        account
    }

    /// Endereço que assina por este agente — a conta corporativa.
    /// Falha se o agente foi revogado: melhor erro que endereço obsoleto.
    pub fn resolve(e: &Env, name: Symbol, label: Symbol) -> Address {
        let org = load_org(e, &name);
        let record = load_agent(e, &name, &label);
        if !record.active {
            panic_with_error!(e, RegistryError::AgentRevoked);
        }
        org.account
    }

    pub fn revoke_agent(e: &Env, name: Symbol, label: Symbol) {
        let org = load_org(e, &name);
        org.founder.require_auth();

        let mut record = load_agent(e, &name, &label);
        record.active = false;
        e.storage()
            .persistent()
            .set(&RegistryStorageKey::Agent(name, label), &record);
    }

    /// A consulta da contraparte: uma leitura, sem indexador.
    pub fn credentials_of(e: &Env, name: Symbol, label: Symbol) -> AgentCredentials {
        let org = load_org(e, &name);
        let record = load_agent(e, &name, &label);

        let gate = GateClient::new(e, &record.gate);
        let params = gate.get_params(&record.context_rule_id, &org.account);
        let stats = gate.get_stats(&record.context_rule_id, &org.account);

        let verifier: Address =
            e.storage().instance().get(&RegistryStorageKey::Verifier).unwrap();
        // Fail-closed, como no gate: o que não se verifica, não se afirma.
        let org_verified = IdentityVerifierClient::new(e, &verifier)
            .try_verify_identity(&org.founder)
            .is_ok();

        AgentCredentials {
            org: name,
            label,
            account: org.account,
            active: record.active,
            params,
            stats,
            org_verified,
        }
    }

    pub fn org_of(e: &Env, name: Symbol) -> OrgInfo {
        load_org(e, &name)
    }
}

fn load_org(e: &Env, name: &Symbol) -> OrgInfo {
    e.storage()
        .persistent()
        .get(&RegistryStorageKey::Org(name.clone()))
        .unwrap_or_else(|| panic_with_error!(e, RegistryError::OrgNotFound))
}

fn load_agent(e: &Env, name: &Symbol, label: &Symbol) -> AgentRecord {
    e.storage()
        .persistent()
        .get(&RegistryStorageKey::Agent(name.clone(), label.clone()))
        .unwrap_or_else(|| panic_with_error!(e, RegistryError::AgentNotFound))
}

/// `AgentRule.label` é `String` porque é isso que `add_context_rule` consome;
/// o registro indexa por `Symbol`. A conversão passa pelos bytes — não há
/// caminho direto entre os dois no SDK.
fn label_to_symbol(e: &Env, label: &soroban_sdk::String) -> Symbol {
    let len = label.len() as usize;
    let mut buf = [0u8; 32];
    label.copy_into_slice(&mut buf[..len]);
    Symbol::new(e, core::str::from_utf8(&buf[..len]).unwrap())
}

#[cfg(test)]
mod test;
