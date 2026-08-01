import type { Metadata } from "next";
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Instrument_Sans,
  Instrument_Serif,
  JetBrains_Mono,
  Newsreader,
} from "next/font/google";
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
// Faces do site institucional: só entram dentro de `.tema-site`.
const siteUi = Instrument_Sans({ subsets: ["latin"], variable: "--fonte-site-ui" });
const siteDisplay = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--fonte-site-display",
});
const siteMono = JetBrains_Mono({ subsets: ["latin"], variable: "--fonte-site-mono" });

const dados = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--fonte-dados",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Charter — procuração programável para organizações que operam por agentes",
  description:
    "Constitua uma organização on-chain na Stellar: teto, escopo e prazo por agente, aplicados pela rede; compliance verificável por terceiros; liquidação confidencial com auditoria.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${ui.variable} ${dados.variable} ${siteUi.variable} ${siteDisplay.variable} ${siteMono.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
