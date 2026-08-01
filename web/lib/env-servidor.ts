/**
 * Chaves e endereços do servidor, carregados uma vez por processo.
 *
 * O Next só enxerga `.env*` dentro de `web/`, e o `.env.demo` fica na raiz —
 * mesmo arquivo que os scripts e os testes usam. Este módulo existe para que o
 * carregamento não fique pendurado num consumidor específico: quando morava em
 * `lib/write.ts`, qualquer rota que não importasse aquele módulo subia sem
 * variável nenhuma. Foi assim que `/api/minhas-orgs` respondeu "registry
 * address not configured" enquanto a constituição funcionava.
 *
 * Fica fora de `instrumentation.ts` de propósito: o Next empacota a
 * instrumentação também para o edge, e ali `fs` não compila nem dentro de um
 * `if` — o servidor inteiro cai, homepage junto.
 */
import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import { aplicarEnv } from "./env-demo";

// `process.cwd()` em vez de `import.meta.url`: o bundler reescreve a segunda, e
// o caminho passaria a apontar para dentro de `.next/`.
// `.env.identity` guarda a chave do issuer, separada de propósito: quem emite
// claim KYB não é quem assina transações da demo.
for (const arquivo of [".env.demo", ".env.identity"]) {
  for (const base of ["..", "."]) {
    try {
      // Ausência é normal: em container as chaves vêm do compose, e
      // `aplicarEnv` nunca sobrescreve o que já está no ambiente.
      aplicarEnv(readFileSync(join(process.cwd(), base, arquivo), "utf8"));
      break;
    } catch {
      /* próximo candidato */
    }
  }
}

/** Endereços da stack de identidade, do arquivo de deployment. */
export function identidade(): Record<string, string> {
  for (const base of ["..", "."]) {
    try {
      return JSON.parse(
        readFileSync(join(process.cwd(), base, "deployments", "identity-testnet.json"), "utf8"),
      );
    } catch {
      /* próximo candidato */
    }
  }
  throw new Error("deployments/identity-testnet.json not found — is the identity stack up?");
}

/**
 * Variável obrigatória, com a instrução junto.
 *
 * Quem vê este erro está numa tela do app: "missing environment variable"
 * sozinho não diz onde a variável deveria estar.
 */
export function env(k: string): string {
  const v = process.env[k];
  if (!v) {
    throw new Error(
      `Missing environment variable ${k}. The demo keys live in .env.demo at the repository root — copy .env.example, fill it in, and restart the server.`,
    );
  }
  return v;
}
