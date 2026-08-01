import { CtaSection } from "@/components/landing/cta-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { FooterSection } from "@/components/landing/footer-section";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { IntegrationsSection } from "@/components/landing/integrations-section";
import { MetricsSection } from "@/components/landing/metrics-section";
import { Navigation } from "@/components/landing/navigation";
import { StackSection } from "@/components/landing/stack-section";
import { SecuritySection } from "@/components/landing/security-section";

/**
 * Site institucional.
 *
 * A seção de infraestrutura do template — regiões de datacenter, nós por
 * continente — deu lugar a `StackSection`: num hackathon, a pergunta que decide
 * é o que foi aplicado de cada padrão e o que disso é nosso.
 *
 * Ficaram de fora preço e depoimentos: o produto tem uma taxa só, que aparece
 * na hora de constituir, e não há cliente para citar. Depoimento inventado é o
 * tipo de detalhe que um jurado percebe e desconta.
 */
export default function Site() {
  return (
    <main className="tema-site relative min-h-screen overflow-x-hidden">
      <Navigation />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <StackSection />
      <SecuritySection />
      <MetricsSection />
      <IntegrationsSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
}
