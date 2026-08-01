/**
 * Emissão de claim KYB — o ato do compliance officer.
 *
 * Porte de `scripts/issue-claim.sh` para o servidor, com uma diferença que
 * importa: o script implantava o contrato de identidade com `--source <alias>`,
 * o que exige a chave secreta do sujeito no `stellar` CLI. Uma carteira de
 * usuário vive no Freighter, e pedir a chave dele seria inaceitável.
 *
 * Aqui o admin paga o deploy e fica como `owner` da identidade, e o registro
 * mapeia a conta do sujeito àquela identidade. Para a demo isso é o papel do
 * emissor; num sistema real o sujeito deveria controlar a própria identidade —
 * a diferença está registrada no HANDOFF, não escondida.
 *
 * O wasm da identidade **não é reenviado**: o hash é lido de um contrato de
 * identidade que já está no ar. Fazer upload de novo custaria taxa e criaria a
 * chance de divergir da versão que o registro já conhece.
 */
import "server-only";
import {
  Address, Contract, Keypair, Networks, Operation, TransactionBuilder, rpc, xdr,
} from "@stellar/stellar-sdk";
import { env, identidade } from "./env-servidor";
import { assinarClaim } from "./claim-kyb";

const server = new rpc.Server(process.env.STELLAR_RPC ?? "https://soroban-testnet.stellar.org");
const PASS = Networks.TESTNET;
const TOPICO_KYB = Number(process.env.CHARTER_CLAIM_TOPIC ?? 1);

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const entrada = (k: string, v: xdr.ScVal) => new xdr.ScMapEntry({ key: sym(k), val: v });

async function enviar(tx: ReturnType<TransactionBuilder["build"]>, assinante: Keypair) {
  const preparada = await server.prepareTransaction(tx);
  preparada.sign(assinante);

  const enviada = await server.sendTransaction(preparada);
  if (enviada.status === "ERROR") throw new Error(JSON.stringify(enviada.errorResult ?? enviada));

  let res = await server.getTransaction(enviada.hash);
  for (let i = 0; i < 40 && res.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await server.getTransaction(enviada.hash);
  }
  if (res.status !== "SUCCESS") throw new Error(`transação ${enviada.hash}: ${res.status}`);
  return res;
}

async function fonte(kp: Keypair) {
  return server.getAccount(kp.publicKey());
}

/** O hash do wasm de um contrato já implantado. */
async function wasmHashDe(contrato: string): Promise<Buffer> {
  const chave = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contrato).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );

  const { entries } = await server.getLedgerEntries(chave);
  const instancia = entries?.[0]?.val?.contractData?.().val?.().instance?.();
  const hash = instancia?.executable?.().wasmHash?.();
  if (!hash) throw new Error(`could not read the wasm hash of ${contrato}`);
  return Buffer.from(hash);
}

export interface ResultadoKyb {
  conta: string;
  identidade: string;
  verificado: boolean;
  hashes: { identidade: string; claim: string; registro: string };
}

/**
 * Registra a conta e emite o claim KYB, em quatro passos on-chain.
 *
 * Termina conferindo com `verify_identity`: um claim que não verifica não serve
 * para nada, e falhar aqui é melhor que anunciar sucesso e o selo continuar
 * negativo na credencial.
 */
export async function emitirKyb(conta: string, pais = "76"): Promise<ResultadoKyb> {
  const admin = Keypair.fromSecret(env("ADMIN_SECRET"));
  const stack = identidade();
  const emissor = stack.claimIssuer;
  const registro = stack.identityRegistry;
  const verificador = stack.identityVerifier;
  // Uma identidade já no ar serve de molde: o wasm é o mesmo, e reenviá-lo
  // custaria taxa e abriria espaço para divergir da versão que o registro
  // conhece.
  const modelo = stack.supplierIdentity;
  const segredo = env("ISSUER_SK");

  // 1. contrato de identidade do sujeito, do mesmo wasm já no ar
  const wasmHash = await wasmHashDe(modelo);
  const criacao = await enviar(
    new TransactionBuilder(await fonte(admin), { fee: "10000000", networkPassphrase: PASS })
      .addOperation(
        Operation.createCustomContract({
          address: new Address(admin.publicKey()),
          wasmHash,
          constructorArgs: [new Address(admin.publicKey()).toScVal()],
        }),
      )
      .setTimeout(60)
      .build(),
    admin,
  );

  const contratoIdentidade = Address.fromScAddress(
    xdr.ScAddress.fromXDR(criacao.returnValue!.address().toXDR()),
  ).toString();

  // 2. claim assinado pelo issuer confiável
  const { dados, assinatura } = assinarClaim({
    segredoHex: segredo,
    emissor,
    identidade: contratoIdentidade,
    topico: TOPICO_KYB,
    criadoEm: Math.floor(Date.now() / 1000),
  });

  const claim = await enviar(
    new TransactionBuilder(await fonte(admin), { fee: "10000000", networkPassphrase: PASS })
      .addOperation(
        new Contract(contratoIdentidade).call(
          "add_claim",
          xdr.ScVal.scvU32(TOPICO_KYB),
          xdr.ScVal.scvU32(101), // esquema ed25519
          new Address(emissor).toScVal(),
          xdr.ScVal.scvBytes(assinatura),
          xdr.ScVal.scvBytes(dados),
          xdr.ScVal.scvString(`https://charter.example/kyb/${conta}`),
        ),
      )
      .setTimeout(60)
      .build(),
    admin,
  );

  // 3. vínculo conta → identidade. `initial_profiles` não pode ir vazio: o
  //    contrato responde EmptyCountryList (323).
  const perfis = xdr.ScVal.scvVec([
    xdr.ScVal.scvMap([
      entrada(
        "country",
        xdr.ScVal.scvVec([
          sym("Individual"),
          xdr.ScVal.scvVec([sym("Residence"), xdr.ScVal.scvU32(Number(pais))]),
        ]),
      ),
      entrada("metadata", xdr.ScVal.scvVoid()),
    ]),
  ]);

  const vinculo = await enviar(
    new TransactionBuilder(await fonte(admin), { fee: "10000000", networkPassphrase: PASS })
      .addOperation(
        new Contract(registro).call(
          "add_identity",
          new Address(conta).toScVal(),
          new Address(contratoIdentidade).toScVal(),
          perfis,
          new Address(admin.publicKey()).toScVal(),
        ),
      )
      .setTimeout(60)
      .build(),
    admin,
  );

  // 4. conferência — `verify_identity` entra em pânico quando falha, então o
  //    sucesso da simulação é a resposta.
  const prova = new TransactionBuilder(await fonte(admin), {
    fee: "1000000",
    networkPassphrase: PASS,
  })
    .addOperation(
      new Contract(verificador).call("verify_identity", new Address(conta).toScVal()),
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(prova);

  return {
    conta,
    identidade: contratoIdentidade,
    verificado: !rpc.Api.isSimulationError(sim),
    hashes: {
      identidade: criacao.txHash,
      claim: claim.txHash,
      registro: vinculo.txHash,
    },
  };
}

/** Consulta sem escrever: a conta já está verificada? */
export async function estaVerificada(conta: string): Promise<boolean> {
  const tx = new TransactionBuilder(
    await fonte(Keypair.fromSecret(env("ADMIN_SECRET"))),
    { fee: "1000000", networkPassphrase: PASS },
  )
    .addOperation(
      new Contract(identidade().identityVerifier).call(
        "verify_identity",
        new Address(conta).toScVal(),
      ),
    )
    .setTimeout(60)
    .build();

  return !rpc.Api.isSimulationError(await server.simulateTransaction(tx));
}
