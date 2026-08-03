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
    soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/charter_account.wasm");
}

/// Mock do ComplianceGate. `install` é chamado pela conta durante a
/// constituição — é assim que os parâmetros chegam aqui.
#[contract]
struct MockGate;

#[contractimpl]
impl MockGate {
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

    pub fn get_stats(_e: &Env, _context_rule_id: u32, _smart_account: Address) -> AgentStats {
        AgentStats { ops_ok: 7, volume_total: 700, volume_attested: 500, first_seen: 1 }
    }

    /// Guarda o teto para o teste conferir que a alteração chegou.
    pub fn set_max_volume(
        e: &Env,
        context_rule_id: u32,
        smart_account: Address,
        max_volume: Option<i128>,
    ) {
        let mut p: GateParams =
            e.storage().instance().get(&(smart_account.clone(), context_rule_id)).unwrap();
        p.max_volume = max_volume;
        e.storage().instance().set(&(smart_account, context_rule_id), &p);
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

/// Mock do token da taxa. Registra o que foi cobrado, para o teste conferir
/// que o valor saiu do fundador e entrou no cofre.
#[contract]
struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn transfer(e: &Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        e.storage().instance().set(&symbol_short!("from"), &from);
        e.storage().instance().set(&symbol_short!("to"), &to);
        e.storage().instance().set(&symbol_short!("amount"), &amount);
    }

    pub fn cobrado(e: &Env) -> i128 {
        e.storage().instance().get(&symbol_short!("amount")).unwrap_or(0)
    }

    pub fn destino(e: &Env) -> Option<Address> {
        e.storage().instance().get(&symbol_short!("to"))
    }

    pub fn origem(e: &Env) -> Option<Address> {
        e.storage().instance().get(&symbol_short!("from"))
    }
}

const TAXA: i128 = 50_000_000; // 5 XLM

struct Fixture {
    e: Env,
    registry: Address,
    gate: Address,
    verifier: Address,
    token: Address,
    cofre: Address,
    founder: Address,
    target: Address,
}

fn setup_com_taxa(taxa: i128) -> Fixture {
    let e = Env::default();
    // Antes: `add_agent` passava pelo `add_context_rule` do trait, que exige a
    // auth da própria conta e cai no `__check_auth`. Hoje o registro autoriza
    // como gestor, e `mock_all_auths` comum basta — é o mesmo que a rede
    // concede, e é por isso que agora funciona fora do teste.
    e.mock_all_auths();

    let wasm_hash = e.deployer().upload_contract_wasm(account_wasm::WASM);
    let gate = e.register(MockGate, ());
    let verifier = e.register(MockVerifier, ());
    let token = e.register(MockToken, ());
    let cofre = Address::generate(&e);
    let registry = e.register(
        OrgRegistry,
        (wasm_hash, verifier.clone(), token.clone(), taxa, cofre.clone()),
    );

    Fixture {
        founder: Address::generate(&e),
        target: Address::generate(&e),
        e,
        registry,
        gate,
        verifier,
        token,
        cofre,
    }
}

fn setup() -> Fixture {
    setup_com_taxa(TAXA)
}

fn params(f: &Fixture, label: Symbol) -> GateParams {
    GateParams {
        allowed_fns: Vec::from_array(&f.e, [symbol_short!("transfer")]),
        kyb_threshold: 500,
        identity_registry: f.verifier.clone(),
        claim_topic: 1,
        agent_label: label,
        max_volume: None,
    }
}

/// Procuração de um agente, com a carteira dele como signatária.
fn agent(f: &Fixture, label: &str, carteira: &Address) -> AgentRule {
    let mut policies: Map<Address, Val> = Map::new(&f.e);
    policies.set(f.gate.clone(), params(f, Symbol::new(&f.e, label)).into_val(&f.e));

    AgentRule {
        label: String::from_str(&f.e, label),
        target: f.target.clone(),
        valid_until: None,
        // Cada agente assina com a própria carteira: as regras são definidas
        // para ela, não para a do administrador.
        signers: Vec::from_array(&f.e, [Signer::Delegated(carteira.clone())]),
        policies,
    }
}

fn create(f: &Fixture, name: Symbol, agentes: &[(&str, Address)]) -> Address {
    let mut agents = Vec::new(&f.e);
    for (label, carteira) in agentes {
        agents.push_back(agent(f, label, carteira));
    }
    client(f).create_org(&name, &f.founder, &f.gate, &agents)
}

fn client(f: &Fixture) -> OrgRegistryClient<'_> {
    OrgRegistryClient::new(&f.e, &f.registry)
}

// ---------------------------------------------------------------------------
// Taxa de constituição
// ---------------------------------------------------------------------------

#[test]
fn constituir_cobra_a_taxa_do_fundador() {
    let f = setup();
    let carteira = Address::generate(&f.e);
    create(&f, symbol_short!("alphafund"), &[("trader", carteira)]);

    let token = MockTokenClient::new(&f.e, &f.token);
    // A cobrança vive dentro do `create_org`, na mesma transação. Se fosse uma
    // operação separada na interface, qualquer um chamaria o contrato direto e
    // constituiria de graça — cobrança que se pode pular é sugestão.
    assert_eq!(token.cobrado(), TAXA);
    assert_eq!(token.destino(), Some(f.cofre.clone()));
}

#[test]
fn taxa_zero_dispensa_a_cobranca() {
    let f = setup_com_taxa(0);
    let carteira = Address::generate(&f.e);
    create(&f, symbol_short!("gratis"), &[("trader", carteira)]);

    // Sem taxa configurada, nenhuma transferência acontece — nada de mover 0
    // só para cumprir tabela.
    assert_eq!(MockTokenClient::new(&f.e, &f.token).cobrado(), 0);
}

#[test]
fn a_taxa_vigente_e_consultavel_antes_de_constituir() {
    let f = setup();
    // A interface mostra o preço antes de o usuário assinar.
    assert_eq!(client(&f).taxa(), TAXA);
}

// ---------------------------------------------------------------------------
// Constituição
// ---------------------------------------------------------------------------

#[test]
fn create_org_registra_conta_e_agentes() {
    let f = setup();
    let trader = Address::generate(&f.e);
    let auditor = Address::generate(&f.e);
    let name = symbol_short!("alphafund");
    let account = create(&f, name.clone(), &[("trader", trader), ("auditor", auditor)]);

    let info = client(&f).org_of(&name);
    assert_eq!(info.account, account);
    assert_eq!(info.founder, f.founder);
    assert_eq!(info.agents.len(), 2);

    assert_eq!(client(&f).resolve(&name, &symbol_short!("trader")), account);
    assert_eq!(client(&f).resolve(&name, &symbol_short!("auditor")), account);
}

#[test]
#[should_panic(expected = "Error(Contract, #5000)")]
fn nome_duplicado_e_recusado() {
    let f = setup();
    let c = Address::generate(&f.e);
    create(&f, symbol_short!("alphafund"), &[("trader", c.clone())]);
    create(&f, symbol_short!("alphafund"), &[("outro", c)]);
}

#[test]
fn organizacao_pode_nascer_sem_agentes() {
    let f = setup();
    // O administrador adiciona depois — é o fluxo da tela de gestão.
    let account = client(&f).create_org(&symbol_short!("vazia"), &f.founder, &f.gate, &Vec::new(&f.e));
    assert_eq!(client(&f).org_of(&symbol_short!("vazia")).account, account);
}

#[test]
#[should_panic(expected = "Error(Contract, #5001)")]
fn organizacao_inexistente_e_recusada() {
    let f = setup();
    client(&f).org_of(&symbol_short!("ghost"));
}

// ---------------------------------------------------------------------------
// Gestão de agentes — a carteira do administrador manda
// ---------------------------------------------------------------------------

#[test]
fn administrador_adiciona_agente_indicando_a_carteira() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let trader = Address::generate(&f.e);
    create(&f, name.clone(), &[("trader", trader)]);

    let nova_carteira = Address::generate(&f.e);
    client(&f).add_agent(&name, &agent(&f, "tesoureiro", &nova_carteira));

    let account = client(&f).resolve(&name, &Symbol::new(&f.e, "tesoureiro"));
    assert_eq!(client(&f).org_of(&name).agents.len(), 2);

    // A regra nova é a do agente novo, e o signatário é a carteira indicada.
    let cred = client(&f).credentials_of(&name, &Symbol::new(&f.e, "tesoureiro"));
    assert!(cred.active);
    assert_eq!(cred.account, account);
}

#[test]
#[should_panic(expected = "Error(Contract, #5006)")]
fn agente_com_rotulo_repetido_e_recusado() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let c1 = Address::generate(&f.e);
    create(&f, name.clone(), &[("trader", c1)]);

    let c2 = Address::generate(&f.e);
    client(&f).add_agent(&name, &agent(&f, "trader", &c2));
}

#[test]
#[should_panic(expected = "Error(Contract, #5001)")]
fn nao_da_para_adicionar_agente_a_organizacao_inexistente() {
    let f = setup();
    let c = Address::generate(&f.e);
    client(&f).add_agent(&symbol_short!("ghost"), &agent(&f, "trader", &c));
}

#[test]
#[should_panic(expected = "Error(Contract, #5003)")]
fn resolve_de_agente_removido_falha() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let c = Address::generate(&f.e);
    create(&f, name.clone(), &[("trader", c)]);

    client(&f).remove_agent(&name, &symbol_short!("trader"));

    // Falhar é melhor que devolver endereço obsoleto: quem consulta precisa
    // saber que a procuração não vale mais.
    client(&f).resolve(&name, &symbol_short!("trader"));
}

#[test]
fn remover_agente_desativa_a_regra_na_conta() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let c = Address::generate(&f.e);
    let account = create(&f, name.clone(), &[("trader", c)]);

    client(&f).remove_agent(&name, &symbol_short!("trader"));

    // A remoção precisa alcançar a CONTA, não só a credencial: enquanto a
    // context rule existir, o agente segue autorizado on-chain. Era esta a
    // limitação declarada quando só havia revogação no registro.
    f.e.as_contract(&account, || {
        assert_eq!(stellar_accounts::smart_account::get_context_rules_count(&f.e), 1); // só o admin
    });
}

#[test]
fn agente_removido_continua_visivel_como_inativo() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let c = Address::generate(&f.e);
    create(&f, name.clone(), &[("trader", c)]);

    client(&f).remove_agent(&name, &symbol_short!("trader"));

    // A contraparte precisa distinguir "revogado" de "nunca existiu".
    let cred = client(&f).credentials_of(&name, &symbol_short!("trader"));
    assert!(!cred.active);
}

// ---------------------------------------------------------------------------
// Credencial
// ---------------------------------------------------------------------------

#[test]
fn credentials_of_traz_escopo_conduta_e_verificacao() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let c = Address::generate(&f.e);
    let account = create(&f, name.clone(), &[("trader", c)]);
    MockVerifierClient::new(&f.e, &f.verifier).set_verified(&f.founder, &true);

    let cred = client(&f).credentials_of(&name, &symbol_short!("trader"));

    assert_eq!(cred.org, name);
    assert_eq!(cred.label, symbol_short!("trader"));
    assert_eq!(cred.account, account);
    assert!(cred.active);
    assert_eq!(cred.params.kyb_threshold, 500);
    assert_eq!(cred.stats.ops_ok, 7);
    assert!(cred.org_verified);
}

#[test]
fn credentials_of_reporta_organizacao_nao_verificada() {
    let f = setup();
    let name = symbol_short!("shady");
    let c = Address::generate(&f.e);
    create(&f, name.clone(), &[("trader", c)]);

    // Informar é melhor que falhar: a contraparte decide por conta própria.
    assert!(!client(&f).credentials_of(&name, &symbol_short!("trader")).org_verified);
}

#[test]
#[should_panic(expected = "Error(Contract, #5002)")]
fn agente_inexistente_e_recusado() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let c = Address::generate(&f.e);
    create(&f, name.clone(), &[("trader", c)]);

    client(&f).resolve(&name, &symbol_short!("ghost"));
}

#[test]
fn o_segundo_agente_mapeia_para_a_segunda_regra() {
    let f = setup();
    let name = symbol_short!("alphafund");
    let t = Address::generate(&f.e);
    let a = Address::generate(&f.e);
    create(&f, name.clone(), &[("trader", t), ("auditor", a)]);

    // A regra 0 é do administrador; os agentes começam em 1. Se a contagem
    // escorregar, devolve-se a procuração do agente errado.
    let cred = client(&f).credentials_of(&name, &symbol_short!("auditor"));
    assert_eq!(cred.params.agent_label, symbol_short!("auditor"));
}

// ---------------------------------------------------------------------------
// Teto do agente e saque do tesouro
//
// As duas coisas que faltavam para o fundador não ficar refém da própria
// organização: limitar quanto um agente pode mover no total, e tirar de volta o
// que sobrou.
// ---------------------------------------------------------------------------

#[test]
fn o_fundador_altera_o_teto_do_agente() {
    let f = setup();
    let nome = symbol_short!("acme");
    let conta = create(&f, nome.clone(), &[("trader", Address::generate(&f.e))]);

    client(&f).set_agent_limit(&nome, &symbol_short!("trader"), &Some(1_000));

    assert_eq!(MockGateClient::new(&f.e, &f.gate).get_params(&1, &conta).max_volume, Some(1_000));
}

#[test]
fn o_teto_pode_ser_removido_por_quem_o_pos() {
    let f = setup();
    let nome = symbol_short!("acme");
    let conta = create(&f, nome.clone(), &[("trader", Address::generate(&f.e))]);

    client(&f).set_agent_limit(&nome, &symbol_short!("trader"), &Some(1_000));
    client(&f).set_agent_limit(&nome, &symbol_short!("trader"), &None);

    // Afrouxar é decisão do fundador, e o contrato não a impede.
    assert_eq!(MockGateClient::new(&f.e, &f.gate).get_params(&1, &conta).max_volume, None);
}

#[test]
#[should_panic(expected = "Error(Contract, #5003)")]
fn nao_se_altera_teto_de_agente_revogado() {
    let f = setup();
    let nome = symbol_short!("acme");
    create(&f, nome.clone(), &[("trader", Address::generate(&f.e))]);

    client(&f).remove_agent(&nome, &symbol_short!("trader"));
    // A procuração já não existe na conta: mexer no teto dela seria teatro.
    client(&f).set_agent_limit(&nome, &symbol_short!("trader"), &Some(1));
}

#[test]
#[should_panic(expected = "Error(Contract, #5002)")]
fn nao_se_altera_teto_de_agente_inexistente() {
    let f = setup();
    let nome = symbol_short!("acme");
    create(&f, nome.clone(), &[("trader", Address::generate(&f.e))]);
    client(&f).set_agent_limit(&nome, &symbol_short!("fantasma"), &Some(1));
}

#[test]
fn o_fundador_saca_do_tesouro() {
    let f = setup();
    let nome = symbol_short!("acme");
    let conta = create(&f, nome.clone(), &[("trader", Address::generate(&f.e))]);
    let destino = Address::generate(&f.e);

    client(&f).withdraw(&nome, &f.token, &destino, &400);

    // O dinheiro é do fundador: uma organização sem saída deixaria o saldo
    // preso para sempre. Quem transfere é a **conta**, não o registro.
    let token = MockTokenClient::new(&f.e, &f.token);
    assert_eq!(token.cobrado(), 400);
    assert_eq!(token.destino(), Some(destino));
    assert_eq!(token.origem(), Some(conta));
}

#[test]
#[should_panic(expected = "Error(Contract, #5001)")]
fn nao_se_saca_de_organizacao_inexistente() {
    let f = setup();
    client(&f).withdraw(&symbol_short!("fantasma"), &f.token, &f.founder, &1);
}
