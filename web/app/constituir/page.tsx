import ConstituirForm from "@/components/constituir-form";

// `page.tsx` só aceita props de rota, então o formulário — que recebe `onSubmit`
// injetado nos testes — vive como componente e a página é uma casca.
export default function ConstituirPage() {
  return <ConstituirForm />;
}
