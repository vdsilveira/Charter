import PainelOrg from "@/components/painel-org";

export const dynamic = "force-dynamic";

/** Administração da organização — exige a carteira do fundador para agir. */
export default async function PaginaAdmin({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <PainelOrg org={org} />;
}
