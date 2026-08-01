import { NextResponse } from "next/server";
import { constituirOrg } from "@/lib/write";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.org?.trim()) {
      return NextResponse.json({ error: "informe o nome da organização" }, { status: 400 });
    }
    if (!Array.isArray(body.agentes) || body.agentes.length === 0) {
      return NextResponse.json({ error: "a organização precisa de ao menos um agente" }, { status: 400 });
    }
    return NextResponse.json(await constituirOrg(body));
  } catch (e) {
    // A mensagem carrega o código de contrato; a UI traduz para o operador.
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
