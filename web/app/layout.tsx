import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import Chrome from "@/components/chrome";
import "./globals.css";

// Newsreader carrega o ar de documento oficial; Plex Sans dá o registro
// institucional-técnico sem cair no Inter de sempre; Plex Mono existe porque
// endereço, hash e valor são metade do que esta interface mostra.
const display = Newsreader({
  subsets: ["latin"],
  variable: "--fonte-display",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});
const ui = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--fonte-ui",
  weight: ["400", "500", "600"],
});
const dados = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--fonte-dados",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Charter — organizações agentificadas na Stellar",
  description:
    "Constitua uma organização on-chain: procuração programável por agente, compliance verificável por terceiros e liquidação confidencial.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${ui.variable} ${dados.variable}`}>
      <body className="min-h-screen antialiased">
        <Chrome />
        {children}
      </body>
    </html>
  );
}
