import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface Credencial {
  org: string;
  label: string;
  account: string;
  active: boolean;
  orgVerified: boolean;
  policy: {
    allowedFns: string[];
    kybThreshold: string;
    identityRegistry: string;
    claimTopic: number;
  };
  conduct: { opsOk: number; volumeTotal: string; volumeAttested: string; firstSeen: number };
}

/**
 * A credencial que a contraparte lê antes de negociar.
 *
 * Resolve o cold start: um agente recém-criado não tem histórico, mas tem
 * poderes verificáveis. Contrata-se contra a garantia — como se fecha contrato
 * com empresa recém-aberta olhando o contrato social, não o histórico.
 *
 * Nada aqui exige carteira: quem consulta ainda não é cliente.
 */
export default function CredencialAgente({ credencial: c }: { credencial: Credencial }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {c.label}
          <span className="ml-2 font-mono text-xs font-normal text-slate/70">*{c.org}</span>
        </CardTitle>
        {c.active ? <Badge variant="ok">active</Badge> : <Badge variant="alert">revoked</Badge>}
      </CardHeader>

      <CardContent className="space-y-4">
        <section>
          <h4 className="mb-1 text-xs uppercase tracking-wide text-slate">power of attorney</h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate">may invoke</dt>
            <dd>
              {c.policy.allowedFns.length ? (
                <span className="font-mono text-xs">{c.policy.allowedFns.join(", ")}</span>
              ) : (
                <span className="text-slate">
                  no function in scope — this agent moves no value
                </span>
              )}
            </dd>
            <dt className="text-slate">requires KYB above</dt>
            <dd>{c.policy.kybThreshold}</dd>
          </dl>
        </section>

        <section>
          <h4 className="mb-1 text-xs uppercase tracking-wide text-slate">conduct</h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate">approved operations</dt>
            <dd>{c.conduct.opsOk}</dd>
            <dt className="text-slate">total volume</dt>
            <dd className="text-slate">{c.conduct.volumeTotal}</dd>
            <dt className="text-slate">with a verified counterparty</dt>
            <dd data-testid="volume-attested" className="font-semibold">
              {c.conduct.volumeAttested}
            </dd>
          </dl>
        </section>

        <p className="text-sm">
          {c.orgVerified ? (
            <Badge variant="ok">organization verified</Badge>
          ) : (
            <Badge variant="muted">organization not verified</Badge>
          )}
        </p>

        <p className="break-all font-mono text-xs text-slate/70">signs as {c.account}</p>
      </CardContent>
    </Card>
  );
}
