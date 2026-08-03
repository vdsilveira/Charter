#![no_std]
//! # OrgRegistry
//!
//! O cartório: constitui a organização, cobra por isso, e responde — para quem
//! nunca a viu — quem são seus agentes e o que cada um pode fazer.
//!
//! ## Quem manda em quê
//!
//! A **carteira do administrador** governa a organização: adiciona e remove
//! agentes. Cada **agente tem a própria carteira**, e é para ela que as regras
//! são escritas — o administrador indica o endereço, não guarda a chave.
//!
//! O registro é o **gestor** da conta corporativa: foi ele quem a implantou, e
//! é ele quem escreve e apaga procurações lá dentro. A garantia está aqui, na
//! raiz — `founder.require_auth()` antes de qualquer chamada à conta. O gestor
//! só carrega a decisão do fundador até a conta.
//!
//! Não é assim por elegância. Passar pelo `add_context_rule` do trait da OZ
//! exigiria a autorização da própria conta, que cai no `__check_auth` e pede
//! auth fora da raiz — algo que a simulação não grava e o modo `enforce`
//! recusa. Ver o cabeçalho de `charter-account` para a cadeia inteira.
//!
//! ## Remoção com efeito real
//!
//! `remove_agent` remove a context rule **dentro da conta**, não apenas marca o
//! registro. Enquanto a regra existisse, o agente seguiria autorizado on-chain
//! por mais que a credencial dissesse o contrário.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error,
    xdr::ToXdr, Address, BytesN, Env, String, Symbol, Vec,
};

pub use charter_types::{AgentCredentials, AgentRecord, AgentRule, AgentStats, GateParams, OrgInfo};

/// A regra do administrador ocupa o índice 0 na conta; os agentes vêm depois.
const REGRA_ADMIN: u32 = 0;

/// Poderes de um agente cuja procuração já não existe: nenhum.
///
/// Não é um valor de fachada — é o que a rede passou a permitir a ele.
fn sem_poderes(e: &Env, label: &Symbol) -> GateParams {
    GateParams {
        agent_label: label.clone(),
        allowed_fns: Vec::new(e),
        claim_topic: 0,
        identity_registry: e.current_contract_address(),
        kyb_threshold: 0,
        // Teto zero, não "sem teto": um agente revogado não move nada.
        max_volume: Some(0),
    }
}

#[contractclient(name = "GateClient")]
pub trait Gate {
    fn get_params(e: &Env, context_rule_id: u32, smart_account: Address) -> GateParams;
    fn get_stats(e: &Env, context_rule_id: u32, smart_account: Address) -> AgentStats;
}

#[contractclient(name = "IdentityVerifierClient")]
pub trait IdentityVerifier {
    fn verify_identity(e: &Env, account: Address);
}

#[contractclient(name = "TokenClient")]
pub trait Token {
    fn transfer(e: &Env, from: Address, to: Address, amount: i128);
}

/// Entradas administrativas da conta corporativa que o registro invoca.
///
/// **Não** são as do trait da OpenZeppelin. `add_context_rule` exige a
/// autorização da própria conta, o que entra no `__check_auth` e depende de auth
/// fora da raiz — recusado pela rede. Estas são da `CharterAccount` e autorizam
/// pelo gestor, que é este registro. Ver o cabeçalho de `charter-account`.
#[contractclient(name = "AccountClient")]
pub trait ContaDaOrganizacao {
    fn adicionar_regra(e: &Env, agent: AgentRule) -> u32;
    fn remover_regra(e: &Env, id: u32);
    fn sacar(e: &Env, token: Address, para: Address, valor: i128);
}

/// Alteração de teto no gate da procuração.
#[contractclient(name = "GateAdminClient")]
pub trait GateAdmin {
    fn set_max_volume(e: &Env, context_rule_id: u32, smart_account: Address, max_volume: Option<i128>);
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
    /// Agente removido — `resolve` falha em vez de devolver endereço obsoleto.
    AgentRevoked = 5003,
    /// Só o fundador administra a própria organização.
    NotFounder = 5004,
    /// Constituição sem agentes.
    NoAgents = 5005,
    /// Já existe agente com este rótulo na organização.
    LabelTaken = 5006,
}

#[contracttype]
pub enum RegistryStorageKey {
    /// Wasm da conta corporativa, usado em todo `create_org`.
    AccountWasm,
    /// Identity verifier consultado por `credentials_of`.
    Verifier,
    /// Token e valor da taxa de constituição, e para onde ela vai.
    FeeToken,
    FeeAmount,
    Treasury,
    Org(Symbol),
    Agent(Symbol, Symbol),
}

#[contract]
pub struct OrgRegistry;

#[contractimpl]
impl OrgRegistry {
    pub fn __constructor(
        e: &Env,
        account_wasm_hash: BytesN<32>,
        identity_verifier: Address,
        fee_token: Address,
        fee_amount: i128,
        treasury: Address,
    ) {
        let s = e.storage().instance();
        s.set(&RegistryStorageKey::AccountWasm, &account_wasm_hash);
        s.set(&RegistryStorageKey::Verifier, &identity_verifier);
        s.set(&RegistryStorageKey::FeeToken, &fee_token);
        s.set(&RegistryStorageKey::FeeAmount, &fee_amount);
        s.set(&RegistryStorageKey::Treasury, &treasury);
    }

    /// Taxa vigente — a interface mostra o preço antes de o usuário assinar.
    pub fn taxa(e: &Env) -> i128 {
        e.storage().instance().get(&RegistryStorageKey::FeeAmount).unwrap_or(0)
    }

    /// Constitui a organização: cobra a taxa, faz o deploy da conta corporativa
    /// com a regra do administrador e uma procuração por agente, e registra os
    /// rótulos — tudo em uma transação.
    pub fn create_org(
        e: &Env,
        name: Symbol,
        founder: Address,
        gate: Address,
        agents: Vec<AgentRule>,
    ) -> Address {
        founder.require_auth();

        if e.storage().persistent().has(&RegistryStorageKey::Org(name.clone())) {
            panic_with_error!(e, RegistryError::NameTaken);
        }

        cobrar_taxa(e, &founder);

        let wasm: BytesN<32> =
            e.storage().instance().get(&RegistryStorageKey::AccountWasm).unwrap();

        // O nome determina o endereço da conta: mesma constituição, mesmo
        // endereço, e unicidade por construção.
        let salt: BytesN<32> = e.crypto().sha256(&name.clone().to_xdr(e)).into();
        let account = e
            .deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm, (founder.clone(), e.current_contract_address(), agents.clone()));

        let mut labels = Vec::new(e);
        for (i, agent) in agents.iter().enumerate() {
            let label = label_to_symbol(e, &agent.label);
            labels.push_back(label.clone());
            // A regra do administrador ocupa o índice 0; os agentes vêm depois.
            gravar_agente(e, &name, &label, REGRA_ADMIN + 1 + i as u32, &gate);
        }

        e.storage().persistent().set(
            &RegistryStorageKey::Org(name.clone()),
            &OrgInfo { name, founder, account: account.clone(), agents: labels },
        );

        account
    }

    /// Adiciona um agente à organização, com a carteira que o administrador
    /// indicar. Só o fundador — verificado aqui, na raiz.
    pub fn add_agent(e: &Env, name: Symbol, agent: AgentRule) {
        let mut org = load_org(e, &name);
        org.founder.require_auth();

        let label = label_to_symbol(e, &agent.label);
        if e.storage().persistent().has(&RegistryStorageKey::Agent(name.clone(), label.clone())) {
            panic_with_error!(e, RegistryError::LabelTaken);
        }

        let gate = primeiro_gate(e, &agent);
        // `adicionar_regra` em vez do `add_context_rule` do trait: aquele exige
        // a autorização da própria conta, que cai no `__check_auth` e depende de
        // auth fora da raiz — o que a rede recusa. Aqui o registro autoriza como
        // chamador direto. Ver o cabeçalho de `charter-account`.
        let regra_id = AccountClient::new(e, &org.account).adicionar_regra(&agent);

        gravar_agente(e, &name, &label, regra_id, &gate);
        org.agents.push_back(label);
        e.storage().persistent().set(&RegistryStorageKey::Org(name.clone()), &org);
    }

    /// Remove o agente **da conta**, não só do registro: enquanto a context
    /// rule existir, ele segue autorizado on-chain.
    pub fn remove_agent(e: &Env, name: Symbol, label: Symbol) {
        let org = load_org(e, &name);
        org.founder.require_auth();

        let mut record = load_agent(e, &name, &label);
        AccountClient::new(e, &org.account).remover_regra(&record.context_rule_id);

        record.active = false;
        e.storage().persistent().set(&RegistryStorageKey::Agent(name, label), &record);
    }

    /// Altera o teto acumulado de um agente.
    ///
    /// Existe porque procuração sem teto é confiança sem limite: `kyb_threshold`
    /// diz de quem se exige identidade, nunca quanto se pode mover. `None`
    /// remove o teto — o fundador pode afrouxar, e é decisão dele.
    pub fn set_agent_limit(e: &Env, name: Symbol, label: Symbol, max_volume: Option<i128>) {
        let org = load_org(e, &name);
        org.founder.require_auth();

        let record = load_agent(e, &name, &label);
        if !record.active {
            panic_with_error!(e, RegistryError::AgentRevoked);
        }

        GateAdminClient::new(e, &record.gate).set_max_volume(
            &record.context_rule_id,
            &org.account,
            &max_volume,
        );
    }

    /// Retira valor do tesouro para onde o fundador indicar.
    ///
    /// O dinheiro é dele; uma organização sem saída deixaria o saldo preso.
    pub fn withdraw(e: &Env, name: Symbol, token: Address, para: Address, valor: i128) {
        let org = load_org(e, &name);
        org.founder.require_auth();

        AccountClient::new(e, &org.account).sacar(&token, &para, &valor);
    }

    /// Endereço que assina por este agente — a conta corporativa.
    pub fn resolve(e: &Env, name: Symbol, label: Symbol) -> Address {
        let org = load_org(e, &name);
        let record = load_agent(e, &name, &label);
        if !record.active {
            panic_with_error!(e, RegistryError::AgentRevoked);
        }
        org.account
    }

    /// A consulta da contraparte: uma leitura, sem indexador.
    pub fn credentials_of(e: &Env, name: Symbol, label: Symbol) -> AgentCredentials {
        let org = load_org(e, &name);
        let record = load_agent(e, &name, &label);

        // Remover a procuração desinstala a policy, então o gate não responde
        // mais por ela. Perguntar assim mesmo faria a credencial de um agente
        // revogado **falhar** em vez de dizer "revogado" — e a página que a
        // contraparte lê é justamente onde isso precisa ficar claro.
        let gate = GateClient::new(e, &record.gate);
        let params = gate
            .try_get_params(&record.context_rule_id, &org.account)
            .unwrap_or_else(|_| Ok(sem_poderes(e, &label)))
            .unwrap_or_else(|_| sem_poderes(e, &label));
        // Conduta passada não se apaga com a revogação: se o gate ainda
        // responder, o histórico continua à vista.
        let zerado = AgentStats { ops_ok: 0, volume_total: 0, volume_attested: 0, first_seen: 0 };
        let stats = gate
            .try_get_stats(&record.context_rule_id, &org.account)
            .unwrap_or_else(|_| Ok(zerado.clone()))
            .unwrap_or(zerado);

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
        load_org(e, name_ref(&name))
    }
}

fn name_ref(name: &Symbol) -> &Symbol {
    name
}

/// Cobra a taxa de constituição. Taxa zero não move nada — nada de transferir
/// zero só para cumprir tabela.
fn cobrar_taxa(e: &Env, founder: &Address) {
    let valor: i128 = e.storage().instance().get(&RegistryStorageKey::FeeAmount).unwrap_or(0);
    if valor <= 0 {
        return;
    }
    let token: Address = e.storage().instance().get(&RegistryStorageKey::FeeToken).unwrap();
    let cofre: Address = e.storage().instance().get(&RegistryStorageKey::Treasury).unwrap();
    TokenClient::new(e, &token).transfer(founder, &cofre, &valor);
}

fn gravar_agente(e: &Env, org: &Symbol, label: &Symbol, rule_id: u32, gate: &Address) {
    e.storage().persistent().set(
        &RegistryStorageKey::Agent(org.clone(), label.clone()),
        &AgentRecord {
            label: label.clone(),
            context_rule_id: rule_id,
            gate: gate.clone(),
            active: true,
        },
    );
}

/// A policy que guarda escopo e estatísticas do agente. Um agente sem policy
/// nenhuma continua registrado — só não tem conduta a exibir.
fn primeiro_gate(e: &Env, agent: &AgentRule) -> Address {
    agent.policies.keys().first().unwrap_or_else(|| e.current_contract_address())
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

/// `AgentRule.label` é `String` porque é o que `add_context_rule` consome; o
/// registro indexa por `Symbol`. A conversão passa pelos bytes — não há caminho
/// direto entre os dois no SDK.
fn label_to_symbol(e: &Env, label: &String) -> Symbol {
    let len = label.len() as usize;
    let mut buf = [0u8; 32];
    label.copy_into_slice(&mut buf[..len]);
    Symbol::new(e, core::str::from_utf8(&buf[..len]).unwrap())
}

#[cfg(test)]
mod test;
