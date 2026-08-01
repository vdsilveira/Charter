/**
 * Chaves da demo, lidas do `.env.demo` na raiz do repositório.
 *
 * O arquivo não é versionado e fica fora de `web/`, então o Next não o carrega
 * sozinho — ele só enxerga `.env*` dentro do próprio diretório. Duplicar as
 * chaves em `web/.env.local` seria pior: dois arquivos para manter em sincronia,
 * e a divergência só apareceria como transação assinada pela conta errada.
 *
 * O parser é tolerante de propósito. Um append antigo gravou mensagem de erro
 * do CLI dentro do arquivo, o `source` do shell quebrou no meio e as variáveis
 * seguintes ficaram de fora — o sintoma foi `Error(Auth, InvalidAction)` a três
 * camadas de distância da causa. Aqui uma linha ruim é ignorada e o resto passa.
 */

/** `CHAVE=valor` por linha; comentários, linhas em branco e lixo são pulados. */
export function parseEnv(texto: string): Record<string, string> {
  const saida: Record<string, string> = {};

  for (const linha of texto.split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;

    const corte = limpa.indexOf("=");
    if (corte <= 0) continue;

    const chave = limpa.slice(0, corte).trim();
    // Nome que não parece variável de ambiente é lixo de append, não config.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(chave)) continue;

    saida[chave] = limpa.slice(corte + 1).trim();
  }

  return saida;
}

/**
 * Injeta as chaves em `process.env` sem sobrescrever nada.
 *
 * O ambiente real vence o arquivo: em container as chaves vêm do compose, e um
 * `.env.demo` esquecido no disco não pode silenciosamente trocar a conta que
 * assina.
 */
export function aplicarEnv(texto: string, alvo: NodeJS.ProcessEnv = process.env): string[] {
  const lidas = parseEnv(texto);
  const aplicadas: string[] = [];

  for (const [k, v] of Object.entries(lidas)) {
    if (alvo[k]) continue;
    alvo[k] = v;
    aplicadas.push(k);
  }

  return aplicadas;
}
