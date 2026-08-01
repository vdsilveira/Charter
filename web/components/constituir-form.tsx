"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { traduzirErro } from "@/lib/errors";

export interface AgenteForm {
  label: string;
  allowedFns: string[];
  kybThreshold: string;
}

export interface Constituicao {
  org: string;
  agentes: AgenteForm[];
}

export interface ConstituirFormProps {
  /** Injetável para teste; em produção chama a rota que monta o create_org. */
  onSubmit?: (c: Constituicao) => Promise<{ hash: string; account: string }>;
  agentesIniciais?: AgenteForm[];
}

const PADRAO: AgenteForm[] = [{ label: "", allowedFns: ["transfer"], kybThreshold: "500" }];

async function submitPadrao(c: Constituicao) {
  const res = await fetch("/api/org", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(c),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? "falha ao constituir");
  return body as { hash: string; account: string };
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
}: ConstituirFormProps) {
  const [org, setOrg] = useState("");
  const [agentes, setAgentes] = useState<AgenteForm[]>(agentesIniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<{ hash: string; account: string } | null>(null);

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
      setErro("Informe o nome da organização.");
      return;
    }
    if (agentes.length === 0) {
      setErro("A organização precisa de ao menos um agente.");
      return;
    }
    if (agentes.some((a) => !a.label.trim())) {
      setErro("Todo agente precisa de um rótulo.");
      return;
    }

    setEnviando(true);
    try {
      setFeito(await onSubmit({ org: org.trim(), agentes }));
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Constituir organização</h1>
        <p className="text-sm text-neutral-600">
          Uma transação cria a conta corporativa e a procuração de cada agente.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organização</CardTitle>
          <CardDescription>O nome é único e imutável.</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Nome da organização</span>
            <Input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="alphafund" />
          </label>
        </CardContent>
      </Card>

      {agentes.map((a, i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle className="text-base">Agente {i + 1}</CardTitle>
            <CardDescription>
              Escopo vazio significa um agente que não move valor — é o caso do auditor.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Rótulo</span>
              <Input value={a.label} onChange={(e) => atualizar(i, "label", e.target.value)} placeholder="trader" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Funções permitidas</span>
              <Input
                value={a.allowedFns.join(", ")}
                onChange={(e) => atualizar(i, "allowedFns", e.target.value)}
                placeholder="transfer"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Limiar de KYB</span>
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
          {enviando ? "Constituindo…" : "Constituir organização"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setAgentes((a) => [...a, { label: "", allowedFns: [], kybThreshold: "0" }])}
        >
          Adicionar agente
        </Button>
      </div>

      {erro && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {erro}
        </p>
      )}

      {feito && (
        <Card>
          <CardContent className="space-y-2 pt-5 text-sm">
            <p className="font-medium text-emerald-800">Organização constituída.</p>
            <p className="break-all font-mono text-xs">{feito.account}</p>
            <a
              className="underline"
              href={`https://stellar.expert/explorer/testnet/tx/${feito.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              ver no explorer
            </a>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
