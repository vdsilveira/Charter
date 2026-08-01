"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { traduzirErro } from "@/lib/errors";
import { assinarEEnviar, freighter, type FreighterApi } from "@/lib/carteira";

export interface AgenteForm {
  label: string;
  /** Carteira do agente: é para ela que a procuração é escrita. */
  carteira: string;
  allowedFns: string[];
  kybThreshold: string;
}

export interface Constituicao {
  org: string;
  agentes: AgenteForm[];
  /** Carteira conectada — funda a organização e paga a taxa. */
  fundador: string;
}

export interface ConstituirFormProps {
  /** Injetável para teste; em produção monta, assina na carteira e envia. */
  onSubmit?: (c: Constituicao) => Promise<{ hash: string; account: string }>;
  agentesIniciais?: AgenteForm[];
  /** Taxa em stroops, lida do contrato. "0" = constituição gratuita. */
  taxa?: string;
  /** Injetável para teste. */
  api?: FreighterApi;
}

/** Stroops para XLM legível — 7 casas, sem zeros à toa. */
function emXlm(stroops: string): string {
  const n = Number(stroops) / 10_000_000;
  return `${n % 1 === 0 ? n : Number(n.toFixed(4))} XLM`;
}

const PADRAO: AgenteForm[] = [
  { label: "", carteira: "", allowedFns: ["transfer"], kybThreshold: "500" },
];

/**
 * Monta no servidor, assina na carteira, envia.
 *
 * Três passos porque a chave nunca sai do Freighter. O primeiro já roda a
 * simulação: uma constituição que a rede recusaria falha antes de o pop-up
 * abrir, e não se pede assinatura para algo destinado a reverter.
 */
async function submitPadrao(c: Constituicao): Promise<{ hash: string; account: string }> {
  const montagem = await fetch("/api/org", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(c),
  });
  const { xdr, error } = await montagem.json();
  if (!montagem.ok) throw new Error(error ?? "could not charter the organization");

  const { hash, account } = await assinarEEnviar({
    xdr,
    endereco: c.fundador,
    enviar: async (assinada) => {
      const envio = await fetch("/api/tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ xdr: assinada }),
      });
      const corpo = await envio.json();
      if (!envio.ok) throw new Error(corpo?.error ?? "the network refused the transaction");
      return { hash: corpo.hash, account: corpo.retorno };
    },
  });

  return { hash, account };
}

/**
 * Constituição da organização — Fluxo A do SPEC.
 *
 * Uma transação cria a conta corporativa e todas as procurações. O formulário
 * é a única parte da demo em que o operador *escreve* algo; daí a validação ser
 * explícita e o botão travar durante o envio — dois cliques nervosos criariam
 * duas organizações, e o nome é único e imutável.
 */
export default function ConstituirForm({
  onSubmit = submitPadrao,
  agentesIniciais = PADRAO,
  taxa = "0",
  api,
}: ConstituirFormProps) {
  const cobra = Number(taxa) > 0;
  const [org, setOrg] = useState("");
  const [agentes, setAgentes] = useState<AgenteForm[]>(agentesIniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<{ hash: string; account: string } | null>(null);
  const [fundador, setFundador] = useState<string | null>(null);

  // Endereço vazio significa instalado, porém sem permissão para este site.
  // Mostrá-lo antes de qualquer campo evita a pior descoberta possível: chegar
  // ao fim do formulário e não ter com o que assinar.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const wallet = await freighter(api);
        const { address } = (await wallet.getAddress?.()) ?? {};
        if (vivo && address) setFundador(address);
      } catch {
        /* sem carteira: a validação no envio explica */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [api]);

  function atualizar(i: number, campo: keyof AgenteForm, valor: string) {
    setAgentes((atual) =>
      atual.map((a, idx) =>
        idx === i
          ? { ...a, [campo]: campo === "allowedFns" ? valor.split(",").map((s) => s.trim()).filter(Boolean) : valor }
          : a,
      ),
    );
  }

  async function constituir() {
    setErro(null);
    if (!org.trim()) {
      setErro("Enter the organization name.");
      return;
    }
    if (agentes.length === 0) {
      setErro("An organization needs at least one agent.");
      return;
    }
    if (agentes.some((a) => !a.label.trim())) {
      setErro("Every agent needs a label.");
      return;
    }
    if (agentes.some((a) => !a.carteira.trim())) {
      // A procuração é escrita para o endereço do agente — sem ele não há o
      // que registrar, e o agente nasceria incapaz de assinar.
      setErro("Every agent needs a wallet — the power of attorney is written to it.");
      return;
    }
    if (!fundador) {
      setErro("Connect your wallet: you sign as the founder and the fee comes from your account.");
      return;
    }

    setEnviando(true);
    try {
      setFeito(await onSubmit({ org: org.trim(), agentes, fundador }));
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-10">
      <header>
        <p className="rotulo">new organization</p>
        <h1 className="font-serif text-3xl">Charter an organization</h1>
        <p className="mt-1 text-sm text-slate">
          One transaction creates the corporate account and every agent&apos;s power of attorney.
        </p>
        {fundador && (
          <p className="mt-3 text-sm text-slate">
            Signing as{" "}
            <span className="break-all font-mono text-xs text-ink">{fundador}</span>
          </p>
        )}
      </header>

      {cobra && (
        <Card>
          <CardContent className="flex items-baseline justify-between gap-4 pt-5">
            <div>
              <p className="text-sm font-medium">Chartering fee</p>
              <p className="text-xs text-slate">
                Charged in the same transaction that creates the organization — there is no way to
                charter without paying, or to pay without chartering.
              </p>
            </div>
            <p className="whitespace-nowrap text-lg font-semibold">{emXlm(taxa)}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization</CardTitle>
          <CardDescription>The name is unique and permanent.</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="block text-sm">
            <span className="mb-1 block text-slate">Organization name</span>
            <Input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="alphafund" />
          </label>
        </CardContent>
      </Card>

      {agentes.map((a, i) => (
        <Card key={i}>
          <CardHeader>
            {/* O título segue o que foi digitado. Um ordinal fixo faz o campo
                parecer decorativo, e o nome é o que a contraparte vai ler. */}
            <CardTitle className="text-base">
              {a.label.trim() || `Agent ${i + 1}`}
              {a.label.trim() && org.trim() && (
                <span className="ml-2 font-mono text-xs font-normal text-slate/70">
                  {a.label.trim()}*{org.trim()}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              An empty scope means an agent that moves no value — the auditor, for instance.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate">Agent name</span>
              <Input value={a.label} onChange={(e) => atualizar(i, "label", e.target.value)} placeholder="trader" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate">Agent wallet</span>
              <Input
                value={a.carteira}
                onChange={(e) => atualizar(i, "carteira", e.target.value)}
                placeholder="G…"
                className="font-mono text-xs"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate">Allowed functions</span>
              <Input
                value={a.allowedFns.join(", ")}
                onChange={(e) => atualizar(i, "allowedFns", e.target.value)}
                placeholder="transfer"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate">KYB threshold</span>
              <Input
                value={a.kybThreshold}
                onChange={(e) => atualizar(i, "kybThreshold", e.target.value)}
                inputMode="numeric"
              />
            </label>
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center gap-3">
        <Button onClick={constituir} disabled={enviando}>
          {enviando ? "Chartering…" : "Charter organization"}
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            setAgentes((a) => [...a, { label: "", carteira: "", allowedFns: [], kybThreshold: "0" }])
          }
        >
          Add agent
        </Button>
      </div>

      {erro && (
        <p role="alert" className="rounded-md bg-denysoft px-3 py-2 text-sm text-deny">
          {erro}
        </p>
      )}

      {feito && (
        <Card>
          <CardContent className="space-y-2 pt-5 text-sm">
            <p className="font-medium text-ok">Organization chartered.</p>
            <p className="break-all font-mono text-xs">{feito.account}</p>
            <a
              className="underline"
              href={`https://stellar.expert/explorer/testnet/tx/${feito.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              view on the explorer
            </a>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
