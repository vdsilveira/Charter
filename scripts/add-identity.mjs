/**
 * Registra uma conta no identity registry da OpenZeppelin.
 *
 * Existe porque o `stellar` CLI não dá conta deste argumento: `initial_profiles`
 * é `Vec<Val>` e cada elemento é um `CountryData` — uma struct de duas chaves.
 * Em campo de tipo livre o CLI só infere escalares, arrays e maps de chave
 * única (variantes de enum), então rejeita a struct com
 * "expected map with a single key". E a lista não pode ir vazia: o contrato
 * responde `EmptyCountryList` (erro 323).
 *
 * Montamos o ScVal na mão:
 *   CountryData        → ScMap { country, metadata }   (chaves em ordem)
 *   CountryRelation    → ScVec [ Symbol("Individual"), … ]
 *   IndividualRelation → ScVec [ Symbol("Residence"), u32 ]
 *
 * Uso: node add-identity.mjs <registry> <accountG> <identityC> <adminSecret> [countryCode]
 */
import {
  Address, Contract, Keypair, Networks, TransactionBuilder, rpc, xdr,
} from "@stellar/stellar-sdk";

const [registry, account, identity, adminSecret, country = "76"] = process.argv.slice(2);
if (!registry || !account || !identity || !adminSecret) {
  console.error("uso: add-identity.mjs <registry> <account> <identity> <adminSecret> [country]");
  process.exit(1);
}

const RPC = "https://soroban-testnet.stellar.org";
const server = new rpc.Server(RPC);
const admin = Keypair.fromSecret(adminSecret);

const sym = (s) => xdr.ScVal.scvSymbol(s);
const entry = (key, val) => new xdr.ScMapEntry({ key: sym(key), val });

// IndividualCountryRelation::Residence(u32)
const residence = xdr.ScVal.scvVec([sym("Residence"), xdr.ScVal.scvU32(Number(country))]);
// CountryRelation::Individual(...)
const relation = xdr.ScVal.scvVec([sym("Individual"), residence]);
// CountryData { country, metadata: None }
const countryData = xdr.ScVal.scvMap([
  entry("country", relation),
  entry("metadata", xdr.ScVal.scvVoid()),
]);
const profiles = xdr.ScVal.scvVec([countryData]);

const contract = new Contract(registry);
const op = contract.call(
  "add_identity",
  new Address(account).toScVal(),
  new Address(identity).toScVal(),
  profiles,
  new Address(admin.publicKey()).toScVal(),
);

const source = await server.getAccount(admin.publicKey());
const tx = new TransactionBuilder(source, { fee: "1000000", networkPassphrase: Networks.TESTNET })
  .addOperation(op)
  .setTimeout(60)
  .build();

const prepared = await server.prepareTransaction(tx);
prepared.sign(admin);

const sent = await server.sendTransaction(prepared);
if (sent.status === "ERROR") {
  console.error("falha ao enviar:", JSON.stringify(sent, null, 2));
  process.exit(1);
}

let result = await server.getTransaction(sent.hash);
for (let i = 0; i < 30 && result.status === "NOT_FOUND"; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  result = await server.getTransaction(sent.hash);
}

if (result.status !== "SUCCESS") {
  console.error("transação falhou:", JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(sent.hash);
