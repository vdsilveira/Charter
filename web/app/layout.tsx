import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Charter",
  description: "A tesouraria da empresa agentificada na Stellar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
