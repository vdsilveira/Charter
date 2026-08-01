import { NextResponse } from "next/server";
import { ranking } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const labels = (new URL(req.url).searchParams.get("agents") ?? "trader,auditor").split(",");
  try {
    return NextResponse.json({ org, agents: await ranking(org, labels.map((s) => s.trim())) });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
