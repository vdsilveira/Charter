import { Networks } from "@stellar/stellar-sdk";
import { stellarToml } from "@/lib/federation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const dominio = process.env.CHARTER_DOMAIN ?? new URL(req.url).host;
  return new Response(stellarToml({ dominio, rede: Networks.TESTNET }), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Carteiras leem este arquivo de outra origem.
      "access-control-allow-origin": "*",
    },
  });
}
