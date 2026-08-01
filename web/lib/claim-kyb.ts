/**
 * Assinatura de claim KYB — porte do binário Rust `examples/rwa/sign-claim`.
 *
 * O formato não é invenção nossa: espelha `build_claim_message` em
 * `packages/tokens/src/rwa/claim_issuer/storage.rs` da OpenZeppelin. Está aqui
 * em TypeScript porque o compliance officer da demo precisa emitir claim por
 * uma tela, e depender de `cargo run` dentro de uma rota HTTP seria frágil —
 * exigiria o repositório de referência e a toolchain Rust no servidor.
 *
 *     message  = 0x01 ‖ sha256(passphrase) ‖ issuer_xdr ‖ identity_xdr
 *                ‖ topic(u32 BE) ‖ nonce(u32 BE) ‖ claim_data
 *     claim_data = created_at(u64 BE) ‖ valid_until(u64 BE)
 *     sig_data   = pubkey(32) ‖ signature(64)
 *
 * `issuer_xdr` e `identity_xdr` são o `ScVal::Address` serializado — o mesmo
 * que `Address.toScVal().toXDR()` produz, começando pelo discriminante 18.
 */
import { Address, Keypair, hash } from "@stellar/stellar-sdk";

export const PASSPHRASE_TESTNET = "Test SDF Network ; September 2015";

/** `created_at ‖ valid_until`, ambos u64 big-endian. */
export function dadosDoClaim(criadoEm: number, validoAte: number): Buffer {
  const b = Buffer.alloc(16);
  b.writeBigUInt64BE(BigInt(criadoEm), 0);
  b.writeBigUInt64BE(BigInt(validoAte), 8);
  return b;
}

export function mensagemDoClaim({
  emissor,
  identidade,
  topico,
  nonce,
  dados,
  passphrase = PASSPHRASE_TESTNET,
}: {
  emissor: string;
  identidade: string;
  topico: number;
  nonce: number;
  dados: Buffer;
  passphrase?: string;
}): Buffer {
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };

  return Buffer.concat([
    Buffer.from([0x01]),
    hash(Buffer.from(passphrase)),
    new Address(emissor).toScVal().toXDR(),
    new Address(identidade).toScVal().toXDR(),
    u32(topico),
    u32(nonce),
    dados,
  ]);
}

/**
 * Assina o claim com a chave do issuer.
 *
 * `segredoHex` são os 32 bytes de semente ed25519 do issuer — o mesmo
 * `ISSUER_SK` que o script Rust recebe. Sem ela não se emitem claims novos, e a
 * única saída é subir uma stack de identidade nova.
 */
export function assinarClaim({
  segredoHex,
  emissor,
  identidade,
  topico = 1,
  nonce = 0,
  criadoEm,
  validadeDias = 365,
}: {
  segredoHex: string;
  emissor: string;
  identidade: string;
  topico?: number;
  nonce?: number;
  criadoEm: number;
  validadeDias?: number;
}): { dados: Buffer; assinatura: Buffer } {
  const kp = Keypair.fromRawEd25519Seed(Buffer.from(segredoHex.trim(), "hex"));
  const dados = dadosDoClaim(criadoEm, criadoEm + validadeDias * 86400);
  const msg = mensagemDoClaim({ emissor, identidade, topico, nonce, dados });

  // sig_data = chave pública ‖ assinatura. O contrato precisa das duas: ele
  // confere que a chave é a do issuer confiável antes de validar a assinatura.
  return { dados, assinatura: Buffer.concat([kp.rawPublicKey(), kp.sign(msg)]) };
}
