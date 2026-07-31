extern crate std;

use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Events},
    Address, Env, IntoVal, String, Symbol, Vec,
};
use stellar_accounts::smart_account::{ContextRule, ContextRuleType, Signer};

use crate::*;

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

#[contract]
struct MockContract;

/// Mock do identity registry da OZ.
///
/// Respeita a assinatura real: `verify_identity` **panica** quando a conta não
/// está verificada. Um mock que devolvesse `bool` daria confiança falsa e
/// quebraria na integração.
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

fn transfer_ctx(e: &Env, token: &Address, to: &Address, amount: i128) -> Context {
    let mut args = Vec::new(e);
    args.push_back(Address::generate(e).into_val(e)); // from
    args.push_back(to.into_val(e));
    args.push_back(amount.into_val(e));

    Context::Contract(ContractContext {
        contract: token.clone(),
        fn_name: symbol_short!("transfer"),
        args,
    })
}

fn other_fn_ctx(e: &Env, token: &Address, fn_name: Symbol) -> Context {
    Context::Contract(ContractContext {
        contract: token.clone(),
        fn_name,
        args: Vec::new(e),
    })
}

fn rule(e: &Env, token: &Address) -> ContextRule {
    let mut signers = Vec::new(e);
    signers.push_back(Signer::Delegated(Address::generate(e)));

    ContextRule {
        id: 1,
        // CallContract é obrigatório: a spending_limit da OZ recusa qualquer
        // outro tipo com OnlyCallContractAllowed (3227), e nossas regras
        // convivem com ela na mesma rule.
        context_type: ContextRuleType::CallContract(token.clone()),
        name: String::from_str(e, "trader"),
        signers,
        signer_ids: Vec::new(e),
        policies: Vec::new(e),
        policy_ids: Vec::new(e),
        valid_until: None,
    }
}

fn signers(e: &Env) -> Vec<Signer> {
    let mut s = Vec::new(e);
    s.push_back(Signer::Delegated(Address::generate(e)));
    s
}

fn params(e: &Env, registry: &Address, threshold: i128, fns: &[Symbol]) -> GateParams {
    let mut allowed = Vec::new(e);
    for f in fns {
        allowed.push_back(f.clone());
    }
    GateParams {
        allowed_fns: allowed,
        kyb_threshold: threshold,
        identity_registry: registry.clone(),
        claim_topic: 1,
        agent_label: symbol_short!("trader"),
    }
}

struct Fixture {
    e: Env,
    host: Address,
    registry: Address,
    token: Address,
}

fn setup() -> Fixture {
    let e = Env::default();
    e.mock_all_auths();
    let host = e.register(MockContract, ());
    let registry = e.register(MockIdentityRegistry, ());
    let token = Address::generate(&e);
    Fixture { e, host, registry, token }
}

fn set_verified(f: &Fixture, who: &Address, verified: bool) {
    MockIdentityRegistryClient::new(&f.e, &f.registry).set_verified(who, &verified);
}

// ---------------------------------------------------------------------------
// Instalação
// ---------------------------------------------------------------------------

#[test]
fn install_stores_params() {
    let f = setup();
    let sa = Address::generate(&f.e);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        let p = params(&f.e, &f.registry, 500, &[symbol_short!("transfer")]);
        ComplianceGate::install(&f.e, p.clone(), r.clone(), sa.clone());

        let stored = ComplianceGate::get_params(&f.e, r.id, sa.clone());
        assert_eq!(stored.kyb_threshold, 500);
        assert_eq!(stored.allowed_fns.len(), 1);
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #4001)")]
fn install_twice_fails() {
    let f = setup();
    let sa = Address::generate(&f.e);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        let p = params(&f.e, &f.registry, 500, &[symbol_short!("transfer")]);
        ComplianceGate::install(&f.e, p.clone(), r.clone(), sa.clone());
        ComplianceGate::install(&f.e, p, r, sa);
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #4000)")]
fn enforce_without_install_fails() {
    let f = setup();
    let sa = Address::generate(&f.e);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        let to = Address::generate(&f.e);
        let ctx = transfer_ctx(&f.e, &f.token, &to, 10);
        ComplianceGate::enforce(&f.e, ctx, signers(&f.e), r, sa);
    });
}

// ---------------------------------------------------------------------------
// Escopo de função — o par obrigatório: passa dentro, recusa fora
// ---------------------------------------------------------------------------

#[test]
fn transfer_within_scope_and_below_threshold_passes() {
    let f = setup();
    let sa = Address::generate(&f.e);
    let to = Address::generate(&f.e);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        ComplianceGate::install(
            &f.e,
            params(&f.e, &f.registry, 500, &[symbol_short!("transfer")]),
            r.clone(),
            sa.clone(),
        );

        // 100 < 500: não exige claim da contraparte.
        let ctx = transfer_ctx(&f.e, &f.token, &to, 100);
        ComplianceGate::enforce(&f.e, ctx, signers(&f.e), r.clone(), sa.clone());

        let stats = ComplianceGate::get_stats(&f.e, r.id, sa);
        assert_eq!(stats.ops_ok, 1);
        assert_eq!(stats.volume_total, 100);
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #4002)")]
fn function_outside_allowlist_is_refused() {
    let f = setup();
    let sa = Address::generate(&f.e);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        // Agente auditor: escopo vazio, não pode transferir.
        ComplianceGate::install(&f.e, params(&f.e, &f.registry, 500, &[]), r.clone(), sa.clone());

        let to = Address::generate(&f.e);
        let ctx = transfer_ctx(&f.e, &f.token, &to, 10);
        ComplianceGate::enforce(&f.e, ctx, signers(&f.e), r, sa);
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #4004)")]
fn unknown_invocation_shape_is_refused() {
    let f = setup();
    let sa = Address::generate(&f.e);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        // `approve` está no escopo, mas não sabemos extrair valor dela:
        // recusar é a única resposta segura.
        ComplianceGate::install(
            &f.e,
            params(&f.e, &f.registry, 500, &[symbol_short!("approve")]),
            r.clone(),
            sa.clone(),
        );

        let ctx = other_fn_ctx(&f.e, &f.token, symbol_short!("approve"));
        ComplianceGate::enforce(&f.e, ctx, signers(&f.e), r, sa);
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #4005)")]
fn empty_signer_set_is_refused() {
    let f = setup();
    let sa = Address::generate(&f.e);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        ComplianceGate::install(
            &f.e,
            params(&f.e, &f.registry, 500, &[symbol_short!("transfer")]),
            r.clone(),
            sa.clone(),
        );

        let to = Address::generate(&f.e);
        let ctx = transfer_ctx(&f.e, &f.token, &to, 10);
        ComplianceGate::enforce(&f.e, ctx, Vec::new(&f.e), r, sa);
    });
}

// ---------------------------------------------------------------------------
// Gate de KYB — o cenário C da demo
// ---------------------------------------------------------------------------

#[test]
fn above_threshold_with_verified_counterparty_passes() {
    let f = setup();
    let sa = Address::generate(&f.e);
    let to = Address::generate(&f.e);
    set_verified(&f, &to, true);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        ComplianceGate::install(
            &f.e,
            params(&f.e, &f.registry, 500, &[symbol_short!("transfer")]),
            r.clone(),
            sa.clone(),
        );

        let ctx = transfer_ctx(&f.e, &f.token, &to, 600);
        ComplianceGate::enforce(&f.e, ctx, signers(&f.e), r.clone(), sa.clone());

        let stats = ComplianceGate::get_stats(&f.e, r.id, sa);
        assert_eq!(stats.ops_ok, 1);
        assert_eq!(stats.volume_total, 600);
        // Contraparte verificada: conta também no volume atestado.
        assert_eq!(stats.volume_attested, 600);
    });
}

#[test]
#[should_panic(expected = "Error(Contract, #4003)")]
fn above_threshold_with_unverified_counterparty_is_refused() {
    let f = setup();
    let sa = Address::generate(&f.e);
    let to = Address::generate(&f.e);
    set_verified(&f, &to, false);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        ComplianceGate::install(
            &f.e,
            params(&f.e, &f.registry, 500, &[symbol_short!("transfer")]),
            r.clone(),
            sa.clone(),
        );

        let ctx = transfer_ctx(&f.e, &f.token, &to, 600);
        ComplianceGate::enforce(&f.e, ctx, signers(&f.e), r, sa);
    });
}

/// Fluxo F do SPEC: revogar o claim recusa a operação seguinte, sem migrar
/// fundos nem trocar contrato.
#[test]
#[should_panic(expected = "Error(Contract, #4003)")]
fn revoking_claim_refuses_next_operation() {
    let f = setup();
    let sa = Address::generate(&f.e);
    let to = Address::generate(&f.e);
    set_verified(&f, &to, true);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        ComplianceGate::install(
            &f.e,
            params(&f.e, &f.registry, 500, &[symbol_short!("transfer")]),
            r.clone(),
            sa.clone(),
        );
        let ctx = transfer_ctx(&f.e, &f.token, &to, 600);
        ComplianceGate::enforce(&f.e, ctx, signers(&f.e), r.clone(), sa.clone());
    });

    // Compliance officer revoga.
    set_verified(&f, &to, false);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        let ctx = transfer_ctx(&f.e, &f.token, &to, 600);
        ComplianceGate::enforce(&f.e, ctx, signers(&f.e), r, sa);
    });
}

#[test]
fn unverified_counterparty_below_threshold_still_passes() {
    let f = setup();
    let sa = Address::generate(&f.e);
    let to = Address::generate(&f.e);
    set_verified(&f, &to, false);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        ComplianceGate::install(
            &f.e,
            params(&f.e, &f.registry, 500, &[symbol_short!("transfer")]),
            r.clone(),
            sa.clone(),
        );

        // Abaixo do limiar o claim não é exigido — micropagamento de agente
        // não pode depender de KYB, senão a camada x402 morre.
        let ctx = transfer_ctx(&f.e, &f.token, &to, 100);
        ComplianceGate::enforce(&f.e, ctx, signers(&f.e), r.clone(), sa.clone());

        let stats = ComplianceGate::get_stats(&f.e, r.id, sa);
        assert_eq!(stats.ops_ok, 1);
        assert_eq!(stats.volume_total, 100);
        // Não verificada: não entra no volume atestado.
        assert_eq!(stats.volume_attested, 0);
    });
}

// ---------------------------------------------------------------------------
// Instrumentação
// ---------------------------------------------------------------------------

#[test]
fn approved_path_emits_policy_decision() {
    let f = setup();
    let sa = Address::generate(&f.e);
    let to = Address::generate(&f.e);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        ComplianceGate::install(
            &f.e,
            params(&f.e, &f.registry, 500, &[symbol_short!("transfer")]),
            r.clone(),
            sa.clone(),
        );
        let before = f.e.events().all().events().len();

        let ctx = transfer_ctx(&f.e, &f.token, &to, 100);
        ComplianceGate::enforce(&f.e, ctx, signers(&f.e), r, sa);

        assert!(f.e.events().all().events().len() > before, "PolicyDecision não foi emitido");
    });
}

#[test]
fn stats_accumulate_across_operations() {
    let f = setup();
    let sa = Address::generate(&f.e);
    let verified = Address::generate(&f.e);
    let plain = Address::generate(&f.e);
    set_verified(&f, &verified, true);
    set_verified(&f, &plain, false);

    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        ComplianceGate::install(
            &f.e,
            params(&f.e, &f.registry, 500, &[symbol_short!("transfer")]),
            r.clone(),
            sa.clone(),
        );

        ComplianceGate::enforce(
            &f.e,
            transfer_ctx(&f.e, &f.token, &plain, 100),
            signers(&f.e),
            r.clone(),
            sa.clone(),
        );
        ComplianceGate::enforce(
            &f.e,
            transfer_ctx(&f.e, &f.token, &verified, 900),
            signers(&f.e),
            r.clone(),
            sa.clone(),
        );

        let stats = ComplianceGate::get_stats(&f.e, r.id, sa);
        assert_eq!(stats.ops_ok, 2);
        assert_eq!(stats.volume_total, 1000);
        // Só o segundo pagamento foi para contraparte verificada.
        assert_eq!(stats.volume_attested, 900);
    });
}

// ---------------------------------------------------------------------------
// Extração de valor
// ---------------------------------------------------------------------------

#[test]
fn extract_transfer_reads_recipient_and_amount() {
    let f = setup();
    let to = Address::generate(&f.e);

    f.e.as_contract(&f.host, || {
        let ctx = transfer_ctx(&f.e, &f.token, &to, 4242);
        let Context::Contract(cc) = ctx else { panic!("contexto inesperado") };

        let got = extract_transfer(&f.e, &cc).expect("deveria extrair de um transfer");
        assert_eq!(got.0, to);
        assert_eq!(got.1, 4242);
    });
}

#[test]
fn extract_transfer_returns_none_for_other_shapes() {
    let f = setup();

    f.e.as_contract(&f.host, || {
        let ctx = other_fn_ctx(&f.e, &f.token, symbol_short!("approve"));
        let Context::Contract(cc) = ctx else { panic!("contexto inesperado") };

        assert!(extract_transfer(&f.e, &cc).is_none());
    });
}
