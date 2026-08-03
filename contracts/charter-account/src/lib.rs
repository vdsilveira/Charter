#![no_std]
//! # CharterAccount
//!
//! Conta corporativa da organização: um tesouro, várias procurações.
//!
//! Cada agente vira uma `ContextRule` do tipo `CallContract(target)`, com seus
//! próprios signers, prazo e policies. O tipo não é escolha de estilo — a
//! `spending_limit` da OpenZeppelin recusa qualquer outro com
//! `OnlyCallContractAllowed` (erro 3227), e é por isso que o exemplo
//! `multisig-account` da OZ, que cria a regra como `Default`, não serve aqui.
//!
//! Consequência de desenho: **o teto de gasto é por contrato-alvo, não por
//! agente**. Um agente que opera dois ativos precisa de duas regras, com dois
//! tetos independentes.
//!
//! A regra 0 é sempre a do **administrador**, com `Signer::Delegated(admin)` e
//! escopo na própria conta. O escopo na própria conta é deliberado: o
//! administrador governa a organização, mas não ganha uma via livre para o
//! tesouro.
//!
//! ## Por que existe um gestor separado
//!
//! Alterar procurações **não** passa pelo `add_context_rule` do trait da OZ.
//! Aquele método faz `e.current_contract_address().require_auth()`, o que cai no
//! `__check_auth` desta conta; a regra do administrador é `Delegated(fundador)`,
//! e o `authenticate` da OZ responde com `require_auth_for_args` no endereço
//! dele. Isso é autorização **fora da raiz**, dentro do `__check_auth`: a
//! simulação em modo gravação não a produz e o modo `enforce` a recusa. Na
//! prática, adicionar ou remover agente era impossível na rede — passava só em
//! teste, sob `mock_all_auths_allowing_non_root_auth()`, cujo nome descreve
//! exatamente o que a rede não concede.
//!
//! A saída é `adicionar_regra`/`remover_regra`, autorizadas pelo **gestor** — o
//! `OrgRegistry` que fez o deploy desta conta. Autorização de contrato para
//! contrato é satisfeita pelo próprio chamador, sem `__check_auth` no caminho.
//! Os helpers de `smart_account::storage` não exigem auth (o construtor já os
//! usa), então a mudança é local e não afeta a política de assinatura.
//!
//! A garantia não se perde: o registro exige `founder.require_auth()` na raiz
//! antes de tocar aqui. Quem decide continua sendo o fundador — o gestor só
//! carrega a decisão dele até a conta.

// Address/Map/String/Val/Symbol/BytesN e ContextRule aparecem apenas nas
// assinaturas que os macros `contracttrait` expandem — sem eles no escopo, a
// expansão não compila.
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    panic_with_error, Address, Env, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{
    self, AuthPayload, ContextRule, ContextRuleType, ExecutionEntryPoint, Signer, SmartAccount,
    SmartAccountError,
};

pub use charter_types::AgentRule;

#[soroban_sdk::contractclient(name = "TokenClient")]
pub trait Token {
    fn transfer(e: &Env, from: Address, to: Address, amount: i128);
}

/// Nome da regra do administrador. O `OrgRegistry` conta com ela na posição 0.
pub const REGRA_ADMIN: &str = "admin";

#[soroban_sdk::contracttype]
enum Chave {
    /// Quem pode alterar procurações: o registro que fez o deploy.
    Gestor,
}

#[soroban_sdk::contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum ContaError {
    /// Chamador não é o gestor desta conta.
    NaoEhGestor = 6000,
}

#[contract]
pub struct CharterAccount;

#[contractimpl]
impl CharterAccount {
    /// Constitui a conta: a regra do administrador e uma procuração por agente.
    ///
    /// A regra do administrador ocupa o índice 0; os agentes seguem na ordem de
    /// `agents`, a partir de 1. É dessa ordem que o `OrgRegistry` depende para
    /// ligar rótulo a procuração.
    pub fn __constructor(e: &Env, admin: Address, gestor: Address, agents: Vec<AgentRule>) {
        e.storage().instance().set(&Chave::Gestor, &gestor);

        smart_account::add_context_rule(
            e,
            &ContextRuleType::CallContract(e.current_contract_address()),
            &String::from_str(e, REGRA_ADMIN),
            None,
            &Vec::from_array(e, [Signer::Delegated(admin)]),
            &Map::new(e),
        );

        for agent in agents.iter() {
            smart_account::add_context_rule(
                e,
                &ContextRuleType::CallContract(agent.target),
                &agent.label,
                agent.valid_until,
                &agent.signers,
                &agent.policies,
            );
        }
    }

    /// Escreve uma procuração nova. Só o gestor chama.
    ///
    /// Devolve o id da regra criada — é ele que o registro guarda para saber
    /// qual procuração apagar depois.
    pub fn adicionar_regra(e: &Env, agent: AgentRule) -> u32 {
        exigir_gestor(e);
        smart_account::add_context_rule(
            e,
            &ContextRuleType::CallContract(agent.target),
            &agent.label,
            agent.valid_until,
            &agent.signers,
            &agent.policies,
        )
        .id
    }

    /// Apaga a procuração da conta. Enquanto a regra existir, o agente segue
    /// autorizado on-chain — desativar só no registro seria teatro.
    pub fn remover_regra(e: &Env, id: u32) {
        exigir_gestor(e);
        smart_account::remove_context_rule(e, id);
    }

    /// Retira valor do tesouro. Só o gestor chama.
    ///
    /// O fundador precisa de uma saída: o dinheiro é dele, e uma organização
    /// encerrada não pode deixar o saldo preso. A regra do administrador é
    /// escopada à própria conta de propósito e **não** serve para isto — ela
    /// governa procurações, não move valor.
    ///
    /// Aqui não há `__check_auth` no caminho: a conta é quem chama o token, e
    /// um contrato autoriza as próprias sub-invocações.
    pub fn sacar(e: &Env, token: Address, para: Address, valor: i128) {
        exigir_gestor(e);
        TokenClient::new(e, &token).transfer(&e.current_contract_address(), &para, &valor);
    }

    /// Quem administra as procurações desta conta.
    pub fn gestor(e: &Env) -> Address {
        e.storage().instance().get(&Chave::Gestor).unwrap()
    }
}

/// Autorização de contrato para contrato: o registro é o chamador direto, e o
/// host a concede sem passar pelo `__check_auth` — que é justamente o caminho
/// que a rede recusa aqui.
fn exigir_gestor(e: &Env) {
    let gestor: Address = match e.storage().instance().get(&Chave::Gestor) {
        Some(g) => g,
        None => panic_with_error!(e, ContaError::NaoEhGestor),
    };
    gestor.require_auth();
}

#[contractimpl]
impl CustomAccountInterface for CharterAccount {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        smart_account::do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

#[contractimpl(contracttrait)]
impl SmartAccount for CharterAccount {}

#[contractimpl(contracttrait)]
impl ExecutionEntryPoint for CharterAccount {}

#[cfg(test)]
mod test;
