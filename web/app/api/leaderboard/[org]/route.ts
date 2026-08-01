import { NextResponse } from "next/server";
import { orgDe, ranking } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const pedidos = new URL(req.url).searchParams.get("agents");
  try {
    // Sem `?agents`, pergunta ao registro. O padrão fixo que existia aqui era
    // um palpite que escondia agentes de nome próprio.
    const labels = pedidos
      ? pedidos.split(",").map((s) => s.trim())
      : (await orgDe(org)).agents;
    return NextResponse.json({ org, agents: await ranking(org, labels) });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
