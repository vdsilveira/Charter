"use client";

import ComOrg from "@/components/seletor-org";
import CredenciaisDaOrg from "@/components/credenciais-org";

/**
 * A credencial pública das organizações desta carteira.
 *
 * A aba apontava para `/o/alphafund` — a organização da demo, de outra pessoa.
 * A página por nome (`/o/[org]`) continua aberta a quem não tem carteira: é
 * dela que a contraparte precisa.
 */
export default function PaginaCredencial() {
  return <ComOrg>{(org) => <CredenciaisDaOrg key={org} org={org} />}</ComOrg>;
}
