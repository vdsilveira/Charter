import PainelAdmin from "@/components/painel-admin";

export const dynamic = "force-dynamic";

/**
 * Área do administrador da plataforma — fora da navegação de propósito.
 *
 * Não listar não é segurança: quem sabe a URL chega aqui. O que protege é o
 * desafio assinado que a rota exige. A ausência do link é só para não oferecer
 * a operadores de organização uma tela que não é deles.
 */
export default function PaginaAdmin() {
  return <PainelAdmin />;
}
