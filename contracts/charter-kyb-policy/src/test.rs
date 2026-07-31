extern crate std;

use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, Env};

use crate::*;

/// Mock do identity registry, com a assinatura real: `verify_identity` panica
/// quando a conta não está verificada.
#[contract]
struct MockIdentityRegistry;

#[contractimpl]
impl MockIdentityRegistry {
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
    policy: Address,
    token: Address,
}

fn setup() -> Fixture {
    let e = Env::default();
    e.mock_all_auths();
    let registry = e.register(MockIdentityRegistry, ());
    let policy = e.register(KybPolicy, (registry.clone(), 1u32));
    let token = Address::generate(&e);
    Fixture { e, registry, policy, token }
}

fn set_verified(f: &Fixture, who: &Address, verified: bool) {
    MockIdentityRegistryClient::new(&f.e, &f.registry).set_verified(who, &verified);
}

fn is_authorized(f: &Fixture, who: &Address) -> bool {
    KybPolicyClient::new(&f.e, &f.policy).is_authorized(who, &f.token)
}

#[test]
fn verified_account_is_authorized() {
    let f = setup();
    let acc = Address::generate(&f.e);
    set_verified(&f, &acc, true);

    assert!(is_authorized(&f, &acc));
}

/// O caso que define o contrato desta policy: recusa é `false`, **não** panic.
/// O token confidencial precisa distinguir "não autorizado" de "gate quebrado".
#[test]
fn unverified_account_returns_false_without_panicking() {
    let f = setup();
    let acc = Address::generate(&f.e);
    set_verified(&f, &acc, false);

    assert!(!is_authorized(&f, &acc));
}

/// Fluxo F do SPEC, na camada confidencial: revogar o claim recusa a operação
/// seguinte, sem migrar fundos nem trocar contrato.
#[test]
fn revoked_claim_is_refused_on_next_call() {
    let f = setup();
    let acc = Address::generate(&f.e);

    set_verified(&f, &acc, true);
    assert!(is_authorized(&f, &acc));

    set_verified(&f, &acc, false);
    assert!(!is_authorized(&f, &acc));
}

/// Conta nunca vista pelo registry: sem claim, sem autorização.
#[test]
fn unknown_account_is_refused() {
    let f = setup();
    let stranger = Address::generate(&f.e);

    assert!(!is_authorized(&f, &stranger));
}

/// Fail-closed: se o registry não responde, a resposta é `false`. Um gate que
/// devolve `true` quando não conseguiu verificar não é um gate.
#[test]
fn unreachable_registry_is_fail_closed() {
    let e = Env::default();
    e.mock_all_auths();

    // Endereço que não hospeda contrato algum.
    let broken_registry = Address::generate(&e);
    let policy = e.register(KybPolicy, (broken_registry, 1u32));
    let token = Address::generate(&e);
    let acc = Address::generate(&e);

    assert!(!KybPolicyClient::new(&e, &policy).is_authorized(&acc, &token));
}

#[test]
fn constructor_stores_registry() {
    let f = setup();
    assert_eq!(KybPolicyClient::new(&f.e, &f.policy).identity_registry(), f.registry);
}
