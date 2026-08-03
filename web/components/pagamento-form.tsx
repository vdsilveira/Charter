"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { traduzirErro } from "@/lib/errors";
import { resolverEndereco } from "@/lib/enderecos";

export interface Simulacao {
  wouldSucceed: boolean;
  error?: string;
}

export interface PagamentoFormProps {
  simular: (p: { destinatario: string; valor: string }) => Promise<Simulacao>;
  enviar: (p: { destinatario: string; valor: string }) => Promise<{ hash: string }>;
  /** Injetável para teste; em produção consulta o servidor de federation. */
  resolver?: (valor: string) => Promise<string>;
}

/**
 * Pagamento do agente, com **simulação prévia obrigatória**.
 *
 * O envio só libera depois que a rede disser que a operação passaria. Isso não
 * é zelo excessivo: o caminho de recusa reverte a transação e não deixa rastro
 * gravável, então sem simular o operador pagaria uma transação para descobrir
 * que foi barrado — e, na demo, olharia para um erro em vez de uma explicação.
 */
export default function PagamentoForm({
  simular,
  enviar,
  resolver = (v) => resolverEndereco(v),
}: PagamentoFormProps) {
  const [destinatario, setDestinatario] = useState("");
  const [valor, setValor] = useState("");
  const [previsao, setPrevisao] = useState<Simulacao | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  /** Endereço para onde o nome federado apontou. */
  const [resolvido, setResolvido] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const podeEnviar = previsao?.wouldSucceed === true && !ocupado;

  async function aoSimular() {
    setOcupado(true);
    setMotivo(null);
    setHash(null);
    try {
      // O nome se resolve aqui, antes de qualquer coisa: o que vai para a rede
      // é sempre o endereço, e quem assina precisa vê-lo.
      const alvo = await resolver(destinatario);
      setResolvido(alvo === destinatario.trim() ? null : alvo);

      const r = await simular({ destinatario: alvo, valor });
      setPrevisao(r);
      if (!r.wouldSucceed) setMotivo(traduzirErro(r.error));
    } catch (err) {
      setPrevisao({ wouldSucceed: false });
      setMotivo(traduzirErro(err));
    } finally {
      setOcupado(false);
    }
  }

  async function aoEnviar() {
    setOcupado(true);
    try {
      const r = await enviar({ destinatario: resolvido ?? destinatario.trim(), valor });
      setHash(r.hash);
    } catch (err) {
      setMotivo(traduzirErro(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate">
            Recipient <span className="text-slate/70">— address or federated name</span>
          </span>
          <Input
            value={destinatario}
            onChange={(e) => {
              setDestinatario(e.target.value);
              setPrevisao(null); // mudou o destino: a previsão anterior não vale mais
              setResolvido(null);
            }}
            placeholder="G… or agent*org*domain"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate">Amount</span>
          <Input
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setPrevisao(null);
            }}
            inputMode="numeric"
            placeholder="0"
          />
        </label>
      </div>

      {resolvido && (
        <p className="break-all font-mono text-xs text-slate">resolved to {resolvido}</p>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={aoSimular} disabled={ocupado}>
          Simulate
        </Button>
        <Button onClick={aoEnviar} disabled={!podeEnviar}>
          Send
        </Button>
        {previsao?.wouldSucceed && !hash && (
          <span className="text-sm text-ok">the network would approve this operation</span>
        )}
      </div>

      {motivo && (
        <p role="alert" className="rounded-md bg-denysoft px-3 py-2 text-sm text-deny">
          Would be refused: {motivo}
        </p>
      )}

      {hash && (
        <p className="rounded-md bg-oksoft px-3 py-2 text-sm text-ok">
          Settled —{" "}
          <a
            className="underline"
            href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            view on the explorer
          </a>
        </p>
      )}
    </div>
  );
}
