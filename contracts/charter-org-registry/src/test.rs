extern crate std;

use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::Address as _,
    Address, Env, IntoVal, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{ContextRule, Signer};

use crate::*;

// O wasm da conta corporativa entra por import: `create_org` faz deploy por
// hash, não por `register`. Exige `stellar contract build` antes do teste —
// está documentado no TESTING.md.
mod account_wasm {
    soroban_sdk::contractimport!(
        file = "../target/wasm32v1-none/release/charter_account.wasm"
    );
}

/// Mock do ComplianceGate: `credentials_of` agrega escopo e conduta, então
/// precisa de alguém que responda `get_params` e `get_stats`.
#[contract]
struct MockGate;

#[contractimpl]
impl MockGate {
    /// A conta chama `install` em cada policy durante a constituição — é assim
    /// que os parâmetros chegam aqui, sem precisar semeá-los à mão.
    pub fn install(
        e: &Env,
        install_params: GateParams,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        e.storage().instance().set(&(smart_account, context_rule.id), &install_params);
    }

    pub fn get_params(e: &Env, context_rule_id: u32, smart_account: Address) -> GateParams {
        e.storage().instance().get(&(smart_account, context_rule_id)).unwrap()
    }

    pub fn get_stats(e: &Env, _context_rule_id: u32, _smart_account: Address) -> AgentStats {
        AgentStats { ops_ok: 7, volume_total: 700, volume_attested: 500, first_seen: 1 }
    }
}

/// Mock do identity verifier: panica quando não verificado, como o da OZ.
#[contract]
struct MockVerifier;

#[contractimpl]
impl MockVerifier {
    pub fn set_verified(e: &Env, account: Address, verified: bool) {
        e.storage().instance().set(&account, &verified);
    }

    pub fn verify_identity(e: &Env, account: Address) {
        let ok: bool = e.storage().instance().get(&account).unwrap_or(false);
        if !ok {
            panic!("identity not verified");
        }
    }
}

struct Fixture {
    e: Env,
    registry: Address,
    gate: Address,
    verifier: Address,
    founder: Address,
    target: Address,
}

fn setup() -> Fixture {
    let e = Env::default();
    e.mock_all_auths();

    let wasm_hash = e.deployer().upload_contract_wasm(account_wasm::WASM);
    let gate = e.register(MockGate, ());
    let verifier = e.register(MockVerifier, ());
    let registry = e.register(OrgRegistry, (wasm_hash, verifier.clone()));

    Fixture {
        founder: Address::generate(&e),
        target: Address::generate(&e),
        e,
        registry,
        gate,
        verifier,
    }
}

fn params(f: &Fixture, label: Symbol) -> GateParams {
    GateParams {
        allowed_fns: Vec::from_array(&f.e, [symbol_short!("transfer")]),
        kyb_threshold: 500,
        identity_registry: f.verifier.clone(),
        claim_topic: 1,
        agent_label: label,
    }
}

fn agent(f: &Fixture, label: &str) -> AgentRule {
    let mut signers = Vec::new(&f.e);
    signers.push_back(Signer::Delegated(Address::generate(&f.e)));

    let mut policies: Map<Address, Val> = Map::new(&f.e);
    policies.set(f.gate.clone(), params(f, Symbol::new(&f.e, label)).into_val(&f.e));

    AgentRule {
        label: String::from_str(&f.e, label),
        target: f.target.clone(),
        valid_until: None,
        signers,
        policies,
    }
}

fn create(f: &Fixture, name: Symbol, labels: &[&str]) -> Address {
    let mut agents = Vec::new(&f.e);
    for l in labels {
        agents.push_back(agent(f, l));
    }
    OrgRegistryClient::new(&f.e, &f.registry).create_org(&name, &f.founder, &f.gate, &agents)
}

fn client(f: &Fixture) -> OrgRegistryClient<'_> {
    OrgRegistryClient::new(&f.e, &f.registry)
}

// ---------------------------------------------------------------------------
// Constituição
// ---------------------------------------------------------------------------

#[test]
fn create_org_deploys_account_and_registers_agents() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let account = create(&f, name.clone(), &["trader", "auditor"]);

    let info = client(&f).org_of(&name);
    assert_eq!(info.account, account);
    assert_eq!(info.founder, f.founder);
    assert_eq!(info.agents.len(), 2);

    // Ambos os agentes assinam pela mesma conta: um tesouro, várias procurações.
    assert_eq!(client(&f).resolve(&name, &symbol_short!("trader")), account);
    assert_eq!(client(&f).resolve(&name, &symbol_short!("auditor")), account);
}

#[test]
#[should_panic(expected = "Error(Contract, #5000)")]
fn duplicate_org_name_is_refused() {
    let f = setup();
    let name = symbol_short!("alphafund");
    create(&f, name.clone(), &["trader"]);
    create(&f, name, &["other"]);
}

#[test]
#[should_panic(expected = "Error(Contract, #5005)")]
fn org_without_agents_is_refused() {
    let f = setup();
    let agents: Vec<AgentRule> = Vec::new(&f.e);
    client(&f).create_org(&symbol_short!("empty"), &f.founder, &f.gate, &agents);
}

#[test]
#[should_panic(expected = "Error(Contract, #5001)")]
fn unknown_org_is_refused() {
    let f = setup();
    client(&f).org_of(&symbol_short!("ghost"));
}

#[test]
#[should_panic(expected = "Error(Contract, #5002)")]
fn unknown_agent_is_refused() {
    let f = setup();
    let name = symbol_short!("alphafund");
    create(&f, name.clone(), &["trader"]);

    client(&f).resolve(&name, &symbol_short!("ghost"));
}

// ---------------------------------------------------------------------------
// Revogação
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Contract, #5003)")]
fn resolve_of_revoked_agent_fails() {
    let f = setup();
    let name = symbol_short!("alphafund");
    create(&f, name.clone(), &["trader"]);

    client(&f).revoke_agent(&name, &symbol_short!("trader"));

    // Falhar é melhor que devolver endereço obsoleto: quem consulta precisa
    // saber que a procuração não vale mais.
    client(&f).resolve(&name, &symbol_short!("trader"));
}

#[test]
fn revoked_agent_still_appears_in_credentials_as_inactive() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let account = create(&f, name.clone(), &["trader"]);

    client(&f).revoke_agent(&name, &symbol_short!("trader"));

    // A credencial continua legível — a contraparte precisa distinguir
    // "revogado" de "nunca existiu".
    let cred = client(&f).credentials_of(&name, &symbol_short!("trader"));
    assert!(!cred.active);
}

// ---------------------------------------------------------------------------
// Credencial — a consulta da contraparte
// ---------------------------------------------------------------------------

#[test]
fn credentials_of_returns_scope_conduct_and_verification() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let account = create(&f, name.clone(), &["trader"]);
    MockVerifierClient::new(&f.e, &f.verifier).set_verified(&f.founder, &true);

    let cred = client(&f).credentials_of(&name, &symbol_short!("trader"));

    assert_eq!(cred.org, name);
    assert_eq!(cred.label, symbol_short!("trader"));
    assert_eq!(cred.account, account);
    assert!(cred.active);
    // Escopo e limiar vêm da policy…
    assert_eq!(cred.params.kyb_threshold, 500);
    assert_eq!(cred.params.allowed_fns.len(), 1);
    // …a conduta, das estatísticas…
    assert_eq!(cred.stats.ops_ok, 7);
    assert_eq!(cred.stats.volume_attested, 500);
    // …e a verificação, do identity registry. Tudo em uma leitura.
    assert!(cred.org_verified);
}

#[test]
fn credentials_of_reports_unverified_org() {
    let f = setup();
    let name = symbol_short!("shady");
    let account = create(&f, name.clone(), &["trader"]);
    // Fundador sem claim: a credencial informa, em vez de falhar.
    let cred = client(&f).credentials_of(&name, &symbol_short!("trader"));
    assert!(!cred.org_verified);
}

#[test]
fn second_agent_maps_to_the_second_context_rule() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let account = create(&f, name.clone(), &["trader", "auditor"]);

    // O auditor é a regra 1. Se a ordem se perder, a contraparte recebe a
    // procuração do agente errado — que é pior do que não receber nada.
    let cred = client(&f).credentials_of(&name, &symbol_short!("auditor"));
    assert_eq!(cred.params.agent_label, symbol_short!("auditor"));
}
