extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, Map, String, Vec};
use stellar_accounts::smart_account::{ContextRuleType, Signer};

use crate::*;

/// O registro que implantou a conta. É ele quem altera procurações — ver o
/// cabeçalho de `lib.rs` para o porquê de não ser o fundador.
fn gestor(e: &Env) -> Address {
    Address::generate(e)
}

fn agent(e: &Env, label: &str, target: &Address, valid_until: Option<u32>) -> AgentRule {
    let mut signers = Vec::new(e);
    signers.push_back(Signer::Delegated(Address::generate(e)));

    AgentRule {
        label: String::from_str(e, label),
        target: target.clone(),
        valid_until,
        signers,
        policies: Map::new(e),
    }
}

#[test]
fn a_primeira_regra_e_do_administrador() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let usdc = Address::generate(&e);

    let mut agents = Vec::new(&e);
    agents.push_back(agent(&e, "trader", &usdc, None));
    let account = e.register(CharterAccount, (admin.clone(), gestor(&e), agents));

    e.as_contract(&account, || {
        let regra = smart_account::get_context_rule(&e, 0);
        assert_eq!(regra.name, String::from_str(&e, "admin"));

        // Escopada à própria conta: o administrador governa a organização —
        // adiciona e remove agentes — mas não ganha uma via livre para o
        // tesouro. Uma regra `Default` daria as duas coisas de uma vez.
        assert_eq!(regra.context_type, ContextRuleType::CallContract(account.clone()));

        // `Delegated` faz a conta delegar a verificação ao endereço do
        // administrador: ele assina a transação com a própria carteira e a
        // conta aceita. Sem isso, administrar exigiria um agente pré-existente
        // para assinar — o ovo antes da galinha.
        assert_eq!(regra.signers, Vec::from_array(&e, [Signer::Delegated(admin)]));
    });
}

#[test]
fn os_agentes_vem_depois_do_administrador() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let usdc = Address::generate(&e);
    let shares = Address::generate(&e);

    let mut agents = Vec::new(&e);
    agents.push_back(agent(&e, "trader", &usdc, None));
    agents.push_back(agent(&e, "auditor", &shares, None));
    let account = e.register(CharterAccount, (admin, gestor(&e), agents));

    e.as_contract(&account, || {
        assert_eq!(smart_account::get_context_rules_count(&e), 3); // admin + 2

        let trader = smart_account::get_context_rule(&e, 1);
        assert_eq!(trader.name, String::from_str(&e, "trader"));
        // CallContract é obrigatório para os agentes: a `spending_limit` da OZ
        // recusa qualquer outro tipo com OnlyCallContractAllowed (3227).
        assert_eq!(trader.context_type, ContextRuleType::CallContract(usdc));

        let auditor = smart_account::get_context_rule(&e, 2);
        assert_eq!(auditor.context_type, ContextRuleType::CallContract(shares));
    });
}

#[test]
fn o_indice_da_regra_segue_a_ordem_dos_agentes() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let target = Address::generate(&e);

    let mut agents = Vec::new(&e);
    for label in ["a", "b", "c"] {
        agents.push_back(agent(&e, label, &target, None));
    }
    let account = e.register(CharterAccount, (admin, gestor(&e), agents));

    // O OrgRegistry liga rótulo a regra por esta ordem, deslocada de um por
    // causa da regra do administrador. Se ela mudar, `credentials_of` devolve
    // a procuração do agente errado — pior do que não devolver nada.
    e.as_contract(&account, || {
        assert_eq!(smart_account::get_context_rule(&e, 1).name, String::from_str(&e, "a"));
        assert_eq!(smart_account::get_context_rule(&e, 2).name, String::from_str(&e, "b"));
        assert_eq!(smart_account::get_context_rule(&e, 3).name, String::from_str(&e, "c"));
    });
}

#[test]
fn preserva_o_prazo_da_procuracao() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let target = Address::generate(&e);

    let mut agents = Vec::new(&e);
    agents.push_back(agent(&e, "temp", &target, Some(12_345)));
    let account = e.register(CharterAccount, (admin, gestor(&e), agents));

    e.as_contract(&account, || {
        assert_eq!(smart_account::get_context_rule(&e, 1).valid_until, Some(12_345));
    });
}

#[test]
fn conta_sem_agentes_e_valida_o_administrador_adiciona_depois() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);

    // Antes isto era recusado. Com a regra do administrador, uma organização
    // pode nascer vazia e receber agentes depois — que é justamente o fluxo de
    // gestão que a interface oferece.
    let agents: Vec<AgentRule> = Vec::new(&e);
    let account = e.register(CharterAccount, (admin, gestor(&e), agents));

    e.as_contract(&account, || {
        assert_eq!(smart_account::get_context_rules_count(&e), 1);
    });
}

// ---------------------------------------------------------------------------
// Gestão de procurações pelo gestor
//
// Este é o caminho que **nunca funcionou na rede** antes: passava pelo
// `add_context_rule` do trait da OZ, que exige a autorização da própria conta e
// cai no `__check_auth`. Ver o cabeçalho de `lib.rs`.
// ---------------------------------------------------------------------------

#[test]
fn o_gestor_escreve_procuracao_nova() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let usdc = Address::generate(&e);
    let registro = Address::generate(&e);

    let mut agents = Vec::new(&e);
    agents.push_back(agent(&e, "trader", &usdc, None));
    let account = e.register(CharterAccount, (admin, registro.clone(), agents));

    let id = CharterAccountClient::new(&e, &account)
        .adicionar_regra(&agent(&e, "tesoureiro", &usdc, None));

    // Regra 0 é do administrador, 1 é o trader — a nova vem depois.
    assert_eq!(id, 2);
    e.as_contract(&account, || {
        assert_eq!(
            smart_account::get_context_rule(&e, id).name,
            String::from_str(&e, "tesoureiro")
        );
    });
}

#[test]
fn o_gestor_apaga_a_procuracao_da_conta() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let usdc = Address::generate(&e);
    let registro = Address::generate(&e);

    let mut agents = Vec::new(&e);
    agents.push_back(agent(&e, "trader", &usdc, None));
    let account = e.register(CharterAccount, (admin, registro, agents));

    CharterAccountClient::new(&e, &account).remover_regra(&1);

    // Desativar só no registro seria teatro: a regra é que autoriza on-chain.
    e.as_contract(&account, || {
        assert_eq!(smart_account::get_context_rules_count(&e), 1);
    });
}

#[test]
#[should_panic]
fn sem_autorizacao_ninguem_escreve_procuracao() {
    // Sem `mock_all_auths`: é o `require_auth` do gestor que decide.
    let e = Env::default();
    let admin = Address::generate(&e);
    let usdc = Address::generate(&e);
    let registro = Address::generate(&e);

    let mut agents = Vec::new(&e);
    agents.push_back(agent(&e, "trader", &usdc, None));
    let account = e.register(CharterAccount, (admin, registro, agents));

    CharterAccountClient::new(&e, &account).adicionar_regra(&agent(&e, "x", &usdc, None));
}

#[test]
#[should_panic]
fn sem_autorizacao_ninguem_apaga_procuracao() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let usdc = Address::generate(&e);
    let registro = Address::generate(&e);

    let mut agents = Vec::new(&e);
    agents.push_back(agent(&e, "trader", &usdc, None));
    let account = e.register(CharterAccount, (admin, registro, agents));

    CharterAccountClient::new(&e, &account).remover_regra(&1);
}

#[test]
fn a_conta_diz_quem_e_o_gestor() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let registro = Address::generate(&e);

    let account = e.register(CharterAccount, (admin, registro.clone(), Vec::<AgentRule>::new(&e)));

    // Quem audita precisa poder ver quem tem a caneta.
    assert_eq!(CharterAccountClient::new(&e, &account).gestor(), registro);
}
