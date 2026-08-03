"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { freighter, PASSPHRASE_TESTNET, type FreighterApi } from "@/lib/carteira";
import { pareceFederado, resolverEndereco } from "@/lib/enderecos";

export interface ResultadoKyb {
  conta: string;
  identidade?: string;
  verificado: boolean;
  jaEstava?: boolean;
  hashes?: { identidade: string; claim: string; registro: string };
}

/** Pede o desafio, assina na carteira e emite. */
async function emitirPadrao(
  conta: string,
  endereco: string,
  api?: FreighterApi,
): Promise<ResultadoKyb> {
  const wallet = await freighter(api);

  const d = await fetch("/api/admin/desafio");
  const { xdr } = await d.json();

  // Assinatura de **transação**, não de mensagem. `signMessage` deixa a extensão
  // decidir o que assinar, e nenhuma das sete formas plausíveis batia; aqui o
  // que se assina é o hash da transação, definido pelo protocolo. É o mesmo
  // caminho que a constituição e o aporte já usam nesta carteira.
  //
  // A transação nasce com sequência 0: assinar prova posse da chave e não
  // autoriza nada, porque a rede nunca a aceitaria.
  const assinado = await wallet.signTransaction?.(xdr, {
    networkPassphrase: PASSPHRASE_TESTNET,
    address: endereco,
  });
  if (assinado?.error || !assinado?.signedTxXdr) {
    throw new Error(assinado?.error ?? "signature declined in the wallet");
  }

  const r = await fetch("/api/admin/kyb", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ desafio: assinado.signedTxXdr, conta }),
  });

  const corpo = await r.json();
  if (!r.ok) throw new Error(corpo?.error ?? "could not issue the claim");
  return corpo;
}

/**
 * Emissão de claim KYB — o papel do compliance officer na demo.
 *
 * A tela é do administrador da plataforma, dono da stack ERC-3643. Quem for
 * outra carteira consegue abrir a página, e é assim mesmo: o que recusa é o
 * servidor, contra um desafio assinado. Esconder a URL não protegeria nada.
 *
 * O que se verifica aqui é o **fundador** de uma organização, porque é o que
 * `credentials_of` consulta para o selo "organização verificada" — não a conta
 * corporativa.
 */
export default function PainelAdmin({
  api,
  emitir = emitirPadrao,
  resolver = (v) => resolverEndereco(v),
}: {
  api?: FreighterApi;
  emitir?: (conta: string, endereco: string, api?: FreighterApi) => Promise<ResultadoKyb>;
  resolver?: (nome: string) => Promise<string>;
}) {
  const [endereco, setEndereco] = useState<string | null>(null);
  const [conta, setConta] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState<ResultadoKyb | null>(null);
  /** Endereço para o qual o nome federado apontou. */
  const [resolvido, setResolvido] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const wallet = await freighter(api);
        const { address } = (await wallet.getAddress?.()) ?? {};
        if (vivo) setEndereco(address || "");
      } catch {
        if (vivo) setEndereco("");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [api]);

  async function verificar() {
    setErro(null);
    setFeito(null);
    setResolvido(null);

    if (!endereco) {
      setErro("Connect the administrator wallet — the server checks the signature against it.");
      return;
    }

    setOcupado(true);
    try {
      // Endereço federado é resolvido antes de qualquer escrita: o que vai para
      // a cadeia é sempre o endereço, nunca o apelido.
      const alvo = await resolver(conta.trim());
      setResolvido(pareceFederado(conta) ? alvo : null);
      setFeito(await emitir(alvo, endereco, api));
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <header>
        <p className="rotulo">platform administration</p>
        <h1 className="font-serif text-3xl">Issue a KYB claim</h1>
        <p className="mt-1 text-sm text-slate">
          The compliance officer&apos;s act: it gives an address the right to receive value above
          the threshold and to hold a verified organization.
        </p>
        {endereco ? (
          <p className="mt-3 break-all font-mono text-xs text-slate">{endereco}</p>
        ) : (
          <p className="mt-3 text-sm text-slate">no wallet connected</p>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account to verify</CardTitle>
          <CardDescription>
            For the &quot;organization verified&quot; seal, this is the <strong>founder</strong>
            &apos;s wallet — that is what the credential reads, not the corporate account. You can
            write <code className="font-mono text-xs">founder*YourOrg*your.domain</code> instead of
            pasting 56 characters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate">
              Stellar address <span className="text-slate/70">or federated name</span>
            </span>
            <Input
              value={conta}
              onChange={(e) => setConta(e.target.value)}
              placeholder="G… or founder*YourOrg*your.domain"
              className="font-mono text-xs"
            />
          </label>

          <Button onClick={verificar} disabled={ocupado}>
            {ocupado ? "Issuing…" : "Issue claim"}
          </Button>

          {erro && (
            <p role="alert" className="rounded-md bg-denysoft px-3 py-2 text-sm text-deny">
              {erro}
            </p>
          )}

          {resolvido && (
            <p className="break-all font-mono text-xs text-slate">
              resolved to {resolvido}
            </p>
          )}

          {feito && (
            <div className="space-y-2 rounded-md bg-oksoft px-3 py-3 text-sm text-ok">
              <p className="font-medium">
                {feito.jaEstava
                  ? "Already verified — nothing was issued."
                  : feito.verificado
                    ? "Verified."
                    : "The claim was issued but verify_identity still refuses."}
              </p>
              {feito.identidade && (
                <p className="break-all font-mono text-xs">identity {feito.identidade}</p>
              )}
              {feito.hashes && (
                <p className="flex flex-wrap gap-3 font-mono text-xs">
                  {Object.entries(feito.hashes).map(([k, h]) => (
                    <a
                      key={k}
                      className="underline"
                      href={`https://stellar.expert/explorer/testnet/tx/${h}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {k}
                    </a>
                  ))}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-slate">
        The identity contract is owned by the administrator, not by the subject. That is the
        issuer&apos;s role in this demo; in a real deployment the subject should control their own
        identity.
      </p>
    </main>
  );
}
