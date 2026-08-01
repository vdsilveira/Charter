extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, Map, String, Vec};
use stellar_accounts::smart_account::{ContextRuleType, Signer};

use crate::*;

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
    let account = e.register(CharterAccount, (admin.clone(), agents));

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
    let account = e.register(CharterAccount, (admin, agents));

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
    let account = e.register(CharterAccount, (admin, agents));

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
    let account = e.register(CharterAccount, (admin, agents));

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
    let account = e.register(CharterAccount, (admin, agents));

    e.as_contract(&account, || {
        assert_eq!(smart_account::get_context_rules_count(&e), 1);
    });
}
