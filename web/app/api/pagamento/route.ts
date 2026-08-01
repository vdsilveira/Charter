import { NextResponse } from "next/server";
import { enviarPagamento } from "@/lib/write";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    return NextResponse.json(await enviarPagamento(await req.json()));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
