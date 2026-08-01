import { NextResponse } from "next/server";
import { decisoes } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ decisions: await decisoes() });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
