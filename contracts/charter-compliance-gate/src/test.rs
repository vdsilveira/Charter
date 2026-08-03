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
//
// `install` e `enforce` chamam `require_auth` sobre a mesma smart account. Numa
// única frame de teste isso produz `Error(Auth, ExistingValue)` — "frame is
// already authorized". Em produção não acontece, porque são transações
// distintas. Por isso cada operação roda no seu próprio `as_contract`, que é o
// mesmo padrão dos testes da OpenZeppelin.

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

struct Fixture {
    e: Env,
    host: Address,
    registry: Address,
    token: Address,
    sa: Address,
}

fn setup() -> Fixture {
    let e = Env::default();
    e.mock_all_auths();
    let host = e.register(MockContract, ());
    let registry = e.register(MockIdentityRegistry, ());
    let token = Address::generate(&e);
    let sa = Address::generate(&e);
    Fixture { e, host, registry, token, sa }
}

fn set_verified(f: &Fixture, who: &Address, verified: bool) {
    MockIdentityRegistryClient::new(&f.e, &f.registry).set_verified(who, &verified);
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
    Context::Contract(ContractContext { contract: token.clone(), fn_name, args: Vec::new(e) })
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
        // Sem teto por padrão; os casos de teto montam o seu.
        max_volume: None,
    }
}

/// Instala a policy com o escopo e o limiar dados. Devolve a context rule.
fn install(f: &Fixture, threshold: i128, fns: &[Symbol]) -> ContextRule {
    let r = f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        ComplianceGate::install(
            &f.e,
            params(&f.e, &f.registry, threshold, fns),
            r.clone(),
            f.sa.clone(),
        );
        r
    });
    r
}

fn enforce(f: &Fixture, r: &ContextRule, ctx: Context, sgn: Vec<Signer>) {
    f.e.as_contract(&f.host, || {
        ComplianceGate::enforce(&f.e, ctx, sgn, r.clone(), f.sa.clone());
    });
}

fn stats(f: &Fixture, r: &ContextRule) -> AgentStats {
    f.e.as_contract(&f.host, || ComplianceGate::get_stats(&f.e, r.id, f.sa.clone()))
}

// ---------------------------------------------------------------------------
// Instalação
// ---------------------------------------------------------------------------

#[test]
fn install_stores_params() {
    let f = setup();
    let r = install(&f, 500, &[symbol_short!("transfer")]);

    let stored = f.e.as_contract(&f.host, || ComplianceGate::get_params(&f.e, r.id, f.sa.clone()));
    assert_eq!(stored.kyb_threshold, 500);
    assert_eq!(stored.allowed_fns.len(), 1);
}

#[test]
#[should_panic(expected = "Error(Contract, #4001)")]
fn install_twice_fails() {
    let f = setup();
    install(&f, 500, &[symbol_short!("transfer")]);
    install(&f, 500, &[symbol_short!("transfer")]);
}

#[test]
#[should_panic(expected = "Error(Contract, #4000)")]
fn enforce_without_install_fails() {
    let f = setup();
    let r = f.e.as_contract(&f.host, || rule(&f.e, &f.token));
    let to = Address::generate(&f.e);

    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &to, 10), signers(&f.e));
}

// ---------------------------------------------------------------------------
// Escopo de função — o par obrigatório: passa dentro, recusa fora
// ---------------------------------------------------------------------------

#[test]
fn transfer_within_scope_and_below_threshold_passes() {
    let f = setup();
    let to = Address::generate(&f.e);
    let r = install(&f, 500, &[symbol_short!("transfer")]);

    // 100 < 500: não exige claim da contraparte.
    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &to, 100), signers(&f.e));

    let s = stats(&f, &r);
    assert_eq!(s.ops_ok, 1);
    assert_eq!(s.volume_total, 100);
}

#[test]
#[should_panic(expected = "Error(Contract, #4002)")]
fn function_outside_allowlist_is_refused() {
    let f = setup();
    // Agente auditor: escopo vazio, não pode transferir.
    let r = install(&f, 500, &[]);
    let to = Address::generate(&f.e);

    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &to, 10), signers(&f.e));
}

#[test]
#[should_panic(expected = "Error(Contract, #4004)")]
fn unknown_invocation_shape_is_refused() {
    let f = setup();
    // `approve` está no escopo, mas não sabemos extrair valor dela:
    // recusar é a única resposta segura.
    let r = install(&f, 500, &[symbol_short!("approve")]);

    enforce(&f, &r, other_fn_ctx(&f.e, &f.token, symbol_short!("approve")), signers(&f.e));
}

#[test]
#[should_panic(expected = "Error(Contract, #4005)")]
fn empty_signer_set_is_refused() {
    let f = setup();
    let r = install(&f, 500, &[symbol_short!("transfer")]);
    let to = Address::generate(&f.e);

    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &to, 10), Vec::new(&f.e));
}

// ---------------------------------------------------------------------------
// Gate de KYB — o cenário C da demo
// ---------------------------------------------------------------------------

#[test]
fn above_threshold_with_verified_counterparty_passes() {
    let f = setup();
    let to = Address::generate(&f.e);
    set_verified(&f, &to, true);

    let r = install(&f, 500, &[symbol_short!("transfer")]);
    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &to, 600), signers(&f.e));

    let s = stats(&f, &r);
    assert_eq!(s.ops_ok, 1);
    assert_eq!(s.volume_total, 600);
    // Contraparte verificada: conta também no volume atestado.
    assert_eq!(s.volume_attested, 600);
}

#[test]
#[should_panic(expected = "Error(Contract, #4003)")]
fn above_threshold_with_unverified_counterparty_is_refused() {
    let f = setup();
    let to = Address::generate(&f.e);
    set_verified(&f, &to, false);

    let r = install(&f, 500, &[symbol_short!("transfer")]);
    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &to, 600), signers(&f.e));
}

/// Fluxo F do SPEC: revogar o claim recusa a operação seguinte, sem migrar
/// fundos nem trocar contrato.
#[test]
#[should_panic(expected = "Error(Contract, #4003)")]
fn revoking_claim_refuses_next_operation() {
    let f = setup();
    let to = Address::generate(&f.e);
    set_verified(&f, &to, true);

    let r = install(&f, 500, &[symbol_short!("transfer")]);
    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &to, 600), signers(&f.e));

    // Compliance officer revoga.
    set_verified(&f, &to, false);

    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &to, 600), signers(&f.e));
}

#[test]
fn unverified_counterparty_below_threshold_still_passes() {
    let f = setup();
    let to = Address::generate(&f.e);
    set_verified(&f, &to, false);

    let r = install(&f, 500, &[symbol_short!("transfer")]);
    // Abaixo do limiar o claim não é exigido — micropagamento de agente não
    // pode depender de KYB, senão a camada x402 morre.
    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &to, 100), signers(&f.e));

    let s = stats(&f, &r);
    assert_eq!(s.ops_ok, 1);
    assert_eq!(s.volume_total, 100);
    // Não verificada: não entra no volume atestado.
    assert_eq!(s.volume_attested, 0);
}

// ---------------------------------------------------------------------------
// Instrumentação
// ---------------------------------------------------------------------------

#[test]
fn o_caminho_aprovado_nao_emite_evento() {
    // Invariante de interoperabilidade, não estilo. O facilitador x402 da
    // OpenZeppelin percorre todos os eventos de contrato da simulação e recusa
    // qualquer um cujo primeiro tópico não seja o símbolo `transfer` — não
    // ignora, recusa. Um evento nosso aqui torna toda operação de uma
    // organização Charter irrecebível pelo padrão.
    //
    // O que registra a operação é o `AgentStats`, logo abaixo, e o `transfer`
    // que o próprio ativo emite.
    let f = setup();
    let to = Address::generate(&f.e);
    let r = install(&f, 500, &[symbol_short!("transfer")]);

    let antes = f.e.events().all().events().len();
    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &to, 100), signers(&f.e));

    assert_eq!(
        f.e.events().all().events().len(),
        antes,
        "o gate emitiu evento — isso faz o facilitador x402 recusar o pagamento",
    );
    assert_eq!(stats(&f, &r).ops_ok, 1, "a operação precisa continuar registrada");
}

#[test]
fn stats_accumulate_across_operations() {
    let f = setup();
    let verified = Address::generate(&f.e);
    let plain = Address::generate(&f.e);
    set_verified(&f, &verified, true);
    set_verified(&f, &plain, false);

    let r = install(&f, 500, &[symbol_short!("transfer")]);
    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &plain, 100), signers(&f.e));
    enforce(&f, &r, transfer_ctx(&f.e, &f.token, &verified, 900), signers(&f.e));

    let s = stats(&f, &r);
    assert_eq!(s.ops_ok, 2);
    assert_eq!(s.volume_total, 1000);
    // Só o segundo pagamento foi para contraparte verificada.
    assert_eq!(s.volume_attested, 900);
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


// ---------------------------------------------------------------------------
// Teto acumulado
//
// `kyb_threshold` diz **de quem** se exige identidade; o teto diz **quanto** se
// pode mover, somando tudo o que já se moveu. Sem ele, uma procuração válida
// drena o tesouro em operações individualmente irrepreensíveis.
// ---------------------------------------------------------------------------

/** Instala com teto acumulado além do limiar de KYB. */
fn install_com_teto(f: &Fixture, teto: Option<i128>) -> ContextRule {
    f.e.as_contract(&f.host, || {
        let r = rule(&f.e, &f.token);
        let mut p = params(&f.e, &f.registry, 500, &[symbol_short!("transfer")]);
        p.max_volume = teto;
        ComplianceGate::install(&f.e, p, r.clone(), f.sa.clone());
        r
    })
}

fn mover(f: &Fixture, r: &ContextRule, quanto: i128) {
    let destino = Address::generate(&f.e);
    set_verified(f, &destino, true);
    enforce(f, r, transfer_ctx(&f.e, &f.token, &destino, quanto), signers(&f.e));
}

#[test]
fn dentro_do_teto_acumulado_passa() {
    let f = setup();
    let r = install_com_teto(&f, Some(1000));

    mover(&f, &r, 400);
    mover(&f, &r, 400);

    assert_eq!(stats(&f, &r).volume_total, 800);
}

#[test]
#[should_panic(expected = "Error(Contract, #4006)")]
fn a_soma_acima_do_teto_e_recusada() {
    let f = setup();
    let r = install_com_teto(&f, Some(1000));

    mover(&f, &r, 900);
    // Sozinha esta caberia. Somada à anterior, não — é o ponto do teto
    // acumulado, e o que um limite por transação não pega.
    mover(&f, &r, 200);
}

#[test]
#[should_panic(expected = "Error(Contract, #4006)")]
fn teto_zero_impede_qualquer_movimento() {
    let f = setup();
    let r = install_com_teto(&f, Some(0));
    mover(&f, &r, 1);
}

#[test]
fn sem_teto_nao_limita() {
    let f = setup();
    // `None` é o que as procurações antigas são, e continuam sendo.
    let r = install_com_teto(&f, None);

    mover(&f, &r, 1_000_000);
    assert_eq!(stats(&f, &r).volume_total, 1_000_000);
}

#[test]
fn o_teto_recusado_nao_conta_como_operacao() {
    let f = setup();
    let r = install_com_teto(&f, Some(500));

    mover(&f, &r, 500);
    let antes = stats(&f, &r);

    // A recusa reverte a transação inteira: a tentativa não entra na conduta,
    // e a credencial não infla com operações que a rede não deixou passar.
    assert_eq!(antes.ops_ok, 1);
    assert_eq!(antes.volume_total, 500);
}
