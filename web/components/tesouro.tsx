"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { assinarEEnviar, freighter, type FreighterApi } from "@/lib/carteira";
import { emXlm, paraStroops } from "@/lib/valores";

async function lerSaldoPadrao(org: string): Promise<string> {
  const r = await fetch(`/api/aporte?org=${encodeURIComponent(org)}`);
  const b = await r.json();
  if (!r.ok) throw new Error(b?.error ?? "could not read the treasury");
  return b.saldo;
}

/** Fluxo comum das escritas: monta no servidor, assina na carteira, envia. */
async function assinarMontagem(url: string, corpo: unknown, endereco: string) {
  const montagem = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const { xdr, error } = await montagem.json();
  if (!montagem.ok) throw new Error(error ?? "could not build the transaction");

  return assinarEEnviar({
    xdr,
    endereco,
    enviar: async (assinada) => {
      const envio = await fetch("/api/tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ xdr: assinada }),
      });
      const c = await envio.json();
      if (!envio.ok) throw new Error(c?.error ?? "the network refused the transaction");
      return c as { hash: string };
    },
  });
}

function sacarPadrao(org: string) {
  return (valor: string, para: string) =>
    assinarMontagem("/api/saque", { org, para, valor, fundador: para }, para);
}

/** Monta no servidor, assina na carteira, envia. */
function aportarPadrao(org: string) {
  return async (valor: string, de: string) => {
    const montagem = await fetch("/api/aporte", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ org, de, valor }),
    });
    const { xdr, error } = await montagem.json();
    if (!montagem.ok) throw new Error(error ?? "could not build the transfer");

    return assinarEEnviar({
      xdr,
      endereco: de,
      enviar: async (assinada) => {
        const envio = await fetch("/api/tx", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ xdr: assinada }),
        });
        const corpo = await envio.json();
        if (!envio.ok) throw new Error(corpo?.error ?? "the network refused the transfer");
        return corpo as { hash: string };
      },
    });
  };
}

/**
 * Tesouro da organização: quanto há, e como pôr mais.
 *
 * A confusão que esta tela desfaz: o saldo **não paga a taxa** das transações
 * do agente — isso é o patrocinador. O saldo é o valor que o agente move. Uma
 * organização sem ele tem procuração perfeitamente válida e transferência que
 * falha assim mesmo, com um erro do token que não menciona saldo.
 *
 * O valor é digitado em XLM e enviado em stroops. Ver `lib/valores` para por
 * que a conversão não usa ponto flutuante.
 */
export default function Tesouro({
  org,
  api,
  lerSaldo = lerSaldoPadrao,
  aportar,
  sacar,
}: {
  org: string;
  api?: FreighterApi;
  lerSaldo?: (org: string) => Promise<string>;
  aportar?: (valor: string, de: string) => Promise<{ hash: string }>;
  sacar?: (valor: string, para: string) => Promise<{ hash: string }>;
}) {
  const enviar = aportar ?? aportarPadrao(org);
  const retirar = sacar ?? sacarPadrao(org);

  const [carteira, setCarteira] = useState<string | null>(null);
  const [saldo, setSaldo] = useState<string | null>(null);
  const [quanto, setQuanto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);
  const [sacando, setSacando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      setSaldo(await lerSaldo(org));
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
    }
  }, [org, lerSaldo]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const wallet = await freighter(api);
        const { address } = (await wallet.getAddress?.()) ?? {};
        if (vivo) setCarteira(address || "");
      } catch {
        if (vivo) setCarteira("");
      }
      if (vivo) await recarregar();
    })();
    return () => {
      vivo = false;
    };
  }, [api, recarregar]);

  /** Aporte e saque compartilham validação, conversão e releitura. */
  async function mover(qual: "aporte" | "saque") {
    setErro(null);
    setFeito(null);

    let stroops: string;
    try {
      stroops = paraStroops(quanto);
    } catch (e) {
      setErro(String((e as Error).message));
      return;
    }

    if (!carteira) {
      setErro("Connect your wallet — the funds come from it.");
      return;
    }

    const marcar = qual === "saque" ? setSacando : setOcupado;
    marcar(true);
    try {
      const { hash } = qual === "saque" ? await retirar(stroops, carteira) : await enviar(stroops, carteira);
      setFeito(hash);
      setQuanto("");
      await recarregar();
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
    } finally {
      marcar(false);
    }
  }


  const vazio = saldo !== null && BigInt(saldo) === 0n;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Treasury</CardTitle>
        <CardDescription>
          What the agents move. This is <strong>not</strong> the transaction fee — that is paid by
          the sponsor, and an agent needs no funds of its own.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-2xl font-semibold">
          {saldo === null ? <span className="text-base text-slate">loading…</span> : `${emXlm(saldo)} XLM`}
        </p>

        {vazio && (
          <p className="text-sm text-slate">
            No funds yet — the agents cannot move value until this account holds some. It is the
            most likely cause of a transfer failing with a valid power of attorney.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate">Amount in XLM</span>
            <Input
              value={quanto}
              onChange={(e) => setQuanto(e.target.value)}
              placeholder="10"
              inputMode="decimal"
            />
          </label>
          <Button onClick={() => mover("aporte")} disabled={ocupado || sacando}>
            {ocupado ? "Waiting for wallet…" : "Add funds"}
          </Button>
          {/* O saque volta para a carteira conectada — o dinheiro é do
              fundador, e uma organização sem saída deixaria o saldo preso. */}
          <Button variant="outline" onClick={() => mover("saque")} disabled={ocupado || sacando}>
            {sacando ? "Waiting for wallet…" : "Withdraw"}
          </Button>
        </div>

        {carteira ? (
          <p className="break-all font-mono text-xs text-slate">from {carteira}</p>
        ) : (
          <p className="text-sm text-slate">no wallet connected</p>
        )}

        {erro && (
          <p role="alert" className="rounded-md bg-denysoft px-3 py-2 text-sm text-deny">
            {erro}
          </p>
        )}

        {feito && (
          <p className="rounded-md bg-oksoft px-3 py-2 text-sm text-ok">
            Funded —{" "}
            <a
              className="underline"
              href={`https://stellar.expert/explorer/testnet/tx/${feito}`}
              target="_blank"
              rel="noreferrer"
            >
              view on the explorer
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
