extern crate std;

use soroban_sdk::{
    testutils::Address as _, Address, Env, Map, String, Vec,
};
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
fn creates_one_rule_per_agent_scoped_to_the_target() {
    let e = Env::default();
    e.mock_all_auths();
    let usdc = Address::generate(&e);
    let shares = Address::generate(&e);

    let mut agents = Vec::new(&e);
    agents.push_back(agent(&e, "trader", &usdc, None));
    agents.push_back(agent(&e, "auditor", &shares, None));

    let account = e.register(CharterAccount, (agents,));

    e.as_contract(&account, || {
        assert_eq!(smart_account::get_context_rules_count(&e), 2);

        let trader = smart_account::get_context_rule(&e, 0);
        assert_eq!(trader.name, String::from_str(&e, "trader"));
        // O tipo precisa ser CallContract: com Default, a spending_limit
        // recusa a instalação com OnlyCallContractAllowed (3227).
        assert_eq!(trader.context_type, ContextRuleType::CallContract(usdc.clone()));

        let auditor = smart_account::get_context_rule(&e, 1);
        assert_eq!(auditor.context_type, ContextRuleType::CallContract(shares.clone()));
    });
}

#[test]
fn rule_ids_follow_the_order_of_agents() {
    let e = Env::default();
    e.mock_all_auths();
    let target = Address::generate(&e);

    let mut agents = Vec::new(&e);
    for label in ["a", "b", "c"] {
        agents.push_back(agent(&e, label, &target, None));
    }

    let account = e.register(CharterAccount, (agents,));

    // O OrgRegistry liga rótulo a regra por esta ordem; se ela mudar,
    // credentials_of passa a devolver a procuração errada.
    e.as_contract(&account, || {
        assert_eq!(smart_account::get_context_rule(&e, 0).name, String::from_str(&e, "a"));
        assert_eq!(smart_account::get_context_rule(&e, 1).name, String::from_str(&e, "b"));
        assert_eq!(smart_account::get_context_rule(&e, 2).name, String::from_str(&e, "c"));
    });
}

#[test]
fn keeps_the_expiry_of_the_delegation() {
    let e = Env::default();
    e.mock_all_auths();
    let target = Address::generate(&e);

    let mut agents = Vec::new(&e);
    agents.push_back(agent(&e, "temp", &target, Some(12_345)));

    let account = e.register(CharterAccount, (agents,));

    e.as_contract(&account, || {
        assert_eq!(smart_account::get_context_rule(&e, 0).valid_until, Some(12_345));
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #6000)")]
fn refuses_an_account_without_agents() {
    let e = Env::default();
    e.mock_all_auths();

    let agents: Vec<AgentRule> = Vec::new(&e);
    e.register(CharterAccount, (agents,));
}
