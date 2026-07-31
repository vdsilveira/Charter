/**
 * Signer x402 que paga a partir da conta corporativa do Charter.
 *
 * O tipo `ClientStellarSigner` do `@x402/stellar` aceita endereço de contrato
 * (C…), não só conta clássica (G…) — é o que torna possível o cenário da
 * trilha: o agente paga uma API por x402 e a policy da smart account decide,
 * on-chain, se aquele pagamento cabe na procuração dele.
 *
 * A parte não óbvia é o que se assina. Os signers de um smart account da
 * OpenZeppelin **não** assinam o `signature_payload` que o host entrega ao
 * `__check_auth`; assinam
 *
 *     auth_digest = sha256(signature_payload || context_rule_ids.to_xdr())
 *
 * O motivo é um ataque real: sem amarrar as regras ao digest, um patrocinador
 * malicioso coletaria assinaturas sob uma regra estrita e trocaria os
 * `context_rule_ids` na `AuthPayload` por uma regra fraca, escapando do teto de
 * gasto. Com a amarração, qualquer troca posterior invalida as assinaturas.
 */
import { Keypair, hash, xdr, Address } from "@stellar/stellar-sdk";

/**
 * @param {object} cfg
 * @param {string} cfg.account          conta corporativa (C…)
 * @param {string} cfg.agentSecret      chave do agente (S…)
 * @param {string} cfg.verifier         contrato verificador ed25519 (C…)
 * @param {number} cfg.contextRuleId    procuração que autoriza esta invocação
 * @param {string} cfg.networkPassphrase
 * @param {import('@stellar/stellar-sdk').rpc.Server} cfg.rpc
 */
export function createCharterSigner(cfg) {
  const kp = Keypair.fromSecret(cfg.agentSecret);
  const networkId = hash(Buffer.from(cfg.networkPassphrase));

  return {
    address: cfg.account,

    async signAuthEntry(authEntryXdr, opts = {}) {
      const entry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, "base64");
      const credentials = entry.credentials().address();

      // Validade da autorização. O x402 informa por quanto tempo a cobrança
      // vale; sem isso, uma auth entry assinada hoje serviria para sempre.
      const validUntil =
        opts.validUntilLedgerSeq ??
        (await cfg.rpc.getLatestLedger()).sequence + 60;
      credentials.signatureExpirationLedger(validUntil);

      // 1. payload do host: o que a rede considera autorizado
      const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
        new xdr.HashIdPreimageSorobanAuthorization({
          networkId,
          nonce: credentials.nonce(),
          signatureExpirationLedger: credentials.signatureExpirationLedger(),
          invocation: entry.rootInvocation(),
        }),
      );
      const signaturePayload = hash(preimage.toXDR());

      // 2. amarra as regras escolhidas ao digest
      const ruleIds = xdr.ScVal.scvVec([xdr.ScVal.scvU32(cfg.contextRuleId)]);
      const authDigest = hash(Buffer.concat([signaturePayload, ruleIds.toXDR()]));

      // 3. o agente assina o digest, nunca o payload cru
      const signature = kp.sign(authDigest);

      // 4. AuthPayload { signers: Map<Signer, Bytes>, context_rule_ids: Vec<u32> }
      //    Signer::External(verifier, pubkey) → ScVec [Symbol, Address, Bytes]
      const signer = xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol("External"),
        new Address(cfg.verifier).toScVal(),
        xdr.ScVal.scvBytes(kp.rawPublicKey()),
      ]);

      // As chaves de um struct em Soroban vão em ordem alfabética:
      // context_rule_ids antes de signers.
      const authPayload = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("context_rule_ids"), val: ruleIds }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("signers"),
          val: xdr.ScVal.scvMap([
            new xdr.ScMapEntry({ key: signer, val: xdr.ScVal.scvBytes(signature) }),
          ]),
        }),
      ]);

      credentials.signature(authPayload);

      return {
        signedAuthEntry: entry.toXDR("base64"),
        signerAddress: cfg.account,
      };
    },
  };
}
