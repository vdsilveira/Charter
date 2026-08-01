/**
 * Assinatura de auth entry pela conta corporativa.
 *
 * Porte TypeScript de `src/charter-signer.mjs` — os dois precisam concordar; se
 * um mudar, o outro muda junto. O `.mjs` serve os scripts de demo em Node puro,
 * este serve as rotas do app.
 *
 * O detalhe que não é óbvio: os signers de um smart account da OpenZeppelin
 * **não** assinam o `signature_payload` que o host entrega ao `__check_auth`.
 * Assinam
 *
 *     auth_digest = sha256(signature_payload || context_rule_ids.to_xdr())
 *
 * Sem essa amarração, um patrocinador malicioso coletaria assinaturas sob uma
 * regra estrita e trocaria os `context_rule_ids` na `AuthPayload` por uma regra
 * fraca, escapando do teto de gasto.
 */
import { Address, Keypair, hash, rpc, xdr } from "@stellar/stellar-sdk";

export interface CharterSignerCfg {
  /** Conta corporativa (C…) de onde a operação parte. */
  account: string;
  /** Chave do agente (S…) — assina auth entries, não é dona do tesouro. */
  agentSecret: string;
  /** Contrato verificador ed25519. */
  verifier: string;
  /** Procuração que autoriza esta invocação. */
  contextRuleId: number;
  networkPassphrase: string;
  rpc: rpc.Server;
}

export function createCharterSigner(cfg: CharterSignerCfg) {
  const kp = Keypair.fromSecret(cfg.agentSecret);
  const networkId = hash(Buffer.from(cfg.networkPassphrase));

  return {
    address: cfg.account,

    async signAuthEntry(
      authEntryXdr: string,
      opts: { validUntilLedgerSeq?: number } = {},
    ): Promise<{ signedAuthEntry: string; signerAddress: string }> {
      const entry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, "base64");
      const credentials = entry.credentials().address();

      const validUntil =
        opts.validUntilLedgerSeq ?? (await cfg.rpc.getLatestLedger()).sequence + 60;
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
      const signer = xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol("External"),
        new Address(cfg.verifier).toScVal(),
        xdr.ScVal.scvBytes(kp.rawPublicKey()),
      ]);

      // Chaves de struct em ordem alfabética: context_rule_ids antes de signers.
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

      return { signedAuthEntry: entry.toXDR("base64"), signerAddress: cfg.account };
    },
  };
}
