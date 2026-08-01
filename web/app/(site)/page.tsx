import { CtaSection } from "@/components/landing/cta-section";
import { DevelopersSection } from "@/components/landing/developers-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { FooterSection } from "@/components/landing/footer-section";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { InfrastructureSection } from "@/components/landing/infrastructure-section";
import { IntegrationsSection } from "@/components/landing/integrations-section";
import { MetricsSection } from "@/components/landing/metrics-section";
import { Navigation } from "@/components/landing/navigation";
import { SecuritySection } from "@/components/landing/security-section";

/**
 * Site institucional.
 *
 * Ficaram de fora as seções de preço e depoimentos do template: o produto tem
 * uma taxa só, que aparece na hora de constituir, e não há cliente para citar.
 * Inventar depoimento num projeto de hackathon é o tipo de detalhe que um
 * jurado percebe e desconta.
 */
export default function Site() {
  return (
    <main className="tema-site relative min-h-screen overflow-x-hidden">
      <Navigation />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <InfrastructureSection />
      <SecuritySection />
      <MetricsSection />
      <IntegrationsSection />
      <DevelopersSection />
      <CtaSection />
      <FooterSection />
    </main>
  );
}
