import type { Metadata } from "next";
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { Faq } from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "AutoHub — Mission Control for Webhook Tools",
  description:
    "Register any n8n, Zapier or Make webhook as a metered tool. HMAC-signed calls, credit wallet with automatic refunds, role-based access. Start free.",
  openGraph: {
    title: "AutoHub — Mission Control for Webhook Tools",
    description:
      "Register webhooks as tools, run them from one console, pay per execution. HMAC-signed, credit-metered, audit-logged.",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <HeroSection />
        <HowItWorks />
        <FeaturesSection />
        <PricingSection />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
