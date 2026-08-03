"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface Saldo {
  gastavel: string;
  tesouro: string;
  token: string;
}

async function lerSaldoPadrao(): Promise<Saldo> {
  const r = await fetch("/api/folha");
  const b = await r.json();
  if (!r.ok) throw new Error(b?.error ?? "could not read the confidential treasury");
  return b;
}

async function pagarPadrao(para: string, valor: string) {
  const r = await fetch("/api/folha", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ para, valor }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b?.error ?? "the payment was refused");
  return b as { hash: string; para: string; valor: string };
}

/**
 * Folha confidencial: a organização paga com o valor oculto.
 *
 * A tela diz duas coisas que seria fácil deixar ambíguas, e caro. Primeira: o
 * que fica oculto é **o valor**, não as partes — quem pagou quem continua
 * visível, e alguém que supusesse o contrário se exporia. Segunda: a chave do
 * tesouro confidencial vive no **servidor**, porque a prova exige o segredo e o
 * Freighter não o expõe; dar a entender que a carteira do fundador assinou seria
 * mentira.
 *
 * A espera também é anunciada. Uma prova de conhecimento zero leva segundos, e
 * um botão travado sem aviso passa por travamento.
 */
export default function Folha({
  lerSaldo = lerSaldoPadrao,
  pagar = pagarPadrao,
}: {
  lerSaldo?: () => Promise<Saldo>;
  pagar?: (para: string, valor: string) => Promise<{ hash: string }>;
}) {
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [para, setPara] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [provando, setProvando] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setSaldo(await lerSaldo());
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
    }
  }, [lerSaldo]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function enviar() {
    setErro(null);
    setFeito(null);
    setProvando(true);
    try {
      const { hash } = await pagar(para.trim(), valor.trim());
      setFeito(hash);
      setValor("");
      await recarregar();
    } catch (e) {
      setErro(String((e as Error)?.message ?? e));
    } finally {
      setProvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Confidential payroll</CardTitle>
        <CardDescription>
          Pay with the amount hidden on-chain. <strong>Who paid whom is visible</strong> — the
          amount is not. The recipient reads it with their own viewing key, and so does the
          designated auditor. Nobody else.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <p className="rotulo">confidential treasury</p>
          <p className="text-2xl font-semibold">
            {saldo ? saldo.gastavel : <span className="text-base text-slate">loading…</span>}
          </p>
          {saldo && (
            <p className="break-all font-mono text-xs text-slate">
              {saldo.tesouro} · token {saldo.token.slice(0, 8)}…
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate">Recipient</span>
            <Input
              value={para}
              onChange={(e) => setPara(e.target.value)}
              placeholder="G…"
              className="font-mono text-xs"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate">Amount</span>
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="400"
              inputMode="numeric"
            />
          </label>
        </div>

        <Button onClick={enviar} disabled={provando}>
          {provando ? "Proving… this takes a few seconds" : "Pay privately"}
        </Button>

        {erro && (
          <p role="alert" className="rounded-md bg-denysoft px-3 py-2 text-sm text-deny">
            {erro}
          </p>
        )}

        {feito && (
          <p className="rounded-md bg-oksoft px-3 py-2 text-sm text-ok">
            Paid — the amount is not on the ledger.{" "}
            <a
              className="underline"
              href={`https://stellar.expert/explorer/testnet/tx/${feito}`}
              target="_blank"
              rel="noreferrer"
            >
              see for yourself
            </a>
          </p>
        )}

        <p className="text-xs leading-relaxed text-slate">
          The treasury key lives on the <strong>server</strong>: the proof needs the secret, and
          Freighter does not expose one. The recipient must have opened their own confidential
          account — only they can, since the registration is signed by their key.
        </p>
      </CardContent>
    </Card>
  );
}
