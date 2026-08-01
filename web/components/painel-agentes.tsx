"use client";

import { useCallback, useEffect, useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { traduzirErro } from "@/lib/errors";

export interface AgenteResumo {
  label: string;
  active: boolean;
  allowedFns: string[];
  kybThreshold: string;
}

export interface NovoAgente {
  label: string;
  carteira: string;
  allowedFns: string[];
  kybThreshold: string;
}

/**
 * Gestão de agentes pela carteira do administrador.
 *
 * Cada agente tem a **própria carteira**: o administrador indica o endereço e a
 * procuração é escrita para ele. Em nenhum momento a chave do agente passa por
 * aqui — o que a organização guarda é a permissão, não o segredo.
 *
 * O endereço é validado antes de sair da tela. Deixar a rede recusar custaria
 * uma transação para descobrir um erro de digitação.
 */
export default function PainelAgentes({
  org,
  carregar,
  adicionar,
  remover,
}: {
  org: string;
  carregar: () => Promise<AgenteResumo[]>;
  adicionar?: (a: NovoAgente) => Promise<{ hash: string }>;
  remover?: (label: string) => Promise<{ hash: string }>;
}) {
  const [agentes, setAgentes] = useState<AgenteResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [label, setLabel] = useState("");
  const [carteira, setCarteira] = useState("");
  const [fns, setFns] = useState("transfer");
  const [limiar, setLimiar] = useState("500");

  const recarregar = useCallback(async () => {
    try {
      setAgentes(await carregar());
    } catch (e) {
      setErro(traduzirErro(e));
    }
  }, [carregar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function confirmarAdicao() {
    setErro(null);
    if (!label.trim()) {
      setErro("Enter the agent name.");
      return;
    }
    if (!carteira.trim()) {
      setErro("Enter the agent wallet — the power of attorney is written to it.");
      return;
    }
    if (!StrKey.isValidEd25519PublicKey(carteira.trim())) {
      setErro("Invalid address: a Stellar wallet starts with G and is 56 characters long.");
      return;
    }

    setOcupado(true);
    try {
      await adicionar?.({
        label: label.trim(),
        carteira: carteira.trim(),
        allowedFns: fns.split(",").map((s) => s.trim()).filter(Boolean),
        kybThreshold: limiar || "0",
      });
      setAbrindo(false);
      setLabel("");
      setCarteira("");
      await recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarRemocao(alvo: string) {
    setOcupado(true);
    setErro(null);
    try {
      await remover?.(alvo);
      setConfirmando(null);
      await recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Agents of {org}</CardTitle>
          <CardDescription>
            Each agent signs with its own wallet. You supply the address; the key never passes
            through here.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAbrindo((v) => !v)}>
          Add agent
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {abrindo && (
          <div className="space-y-3 rounded-lg border border-hairline bg-paper p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-slate">Agent name</span>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="tesoureiro" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate">Agent wallet</span>
                <Input
                  value={carteira}
                  onChange={(e) => setCarteira(e.target.value)}
                  placeholder="G…"
                  className="font-mono text-xs"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate">Allowed functions</span>
                <Input value={fns} onChange={(e) => setFns(e.target.value)} placeholder="transfer" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate">KYB threshold</span>
                <Input value={limiar} onChange={(e) => setLimiar(e.target.value)} inputMode="numeric" />
              </label>
            </div>
            <p className="text-xs text-slate">
              Leave the functions blank for an agent that moves no value — the auditor, for instance.
            </p>
            <Button size="sm" onClick={confirmarAdicao} disabled={ocupado}>
              Add
            </Button>
          </div>
        )}

        {agentes === null ? (
          <p className="text-sm text-slate">loading…</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {agentes.map((a) => (
              <li key={a.label} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">
                    {a.label}{" "}
                    {!a.active && <Badge variant="alert">revoked</Badge>}
                  </p>
                  <p className="text-sm text-slate">
                    {a.allowedFns.length ? (
                      <>
                        may <span className="font-mono text-xs">{a.allowedFns.join(", ")}</span>,
                        requires KYB above {a.kybThreshold}
                      </>
                    ) : (
                      "moves no value — no function in scope"
                    )}
                  </p>
                </div>

                {a.active &&
                  (confirmando === a.label ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate">Are you sure?</span>
                      <Button size="sm" onClick={() => confirmarRemocao(a.label)} disabled={ocupado}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmando(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmando(a.label)}>
                      Remove
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}

        {erro && (
          <p role="alert" className="rounded-md bg-denysoft px-3 py-2 text-sm text-deny">
            {erro}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
