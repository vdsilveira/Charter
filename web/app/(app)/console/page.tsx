"use client";

import ComOrg from "@/components/seletor-org";
import ConsoleDaOrg from "@/components/console-org";

/**
 * Console da organização da carteira conectada.
 *
 * Apontava para `NEXT_PUBLIC_ORG ?? "alphafund"`: quem constituía a própria
 * organização via o painel de outra pessoa.
 */
export default function ConsolePage() {
  return <ComOrg>{(org) => <ConsoleDaOrg key={org} org={org} />}</ComOrg>;
}
