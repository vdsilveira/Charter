import Chrome from "@/components/chrome";

/**
 * Telas de operação: barra do app, sistema de tokens tinta-sobre-papel.
 *
 * A landing tem outra natureza e outra estética — vive em `(site)`, com o
 * próprio cabeçalho. Separar os dois grupos evita a barra do app aparecer sobre
 * o hero e evita o tema escuro do site vazar para as telas de trabalho.
 */
export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Chrome />
      {children}
    </>
  );
}
