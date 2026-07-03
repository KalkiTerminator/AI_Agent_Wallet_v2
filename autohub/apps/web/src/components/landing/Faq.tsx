import { Reveal } from "@/components/shared/Reveal";
import { SectionHeader } from "@/components/shared/SectionHeader";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "What counts as an execution?",
    a: "One run of one tool costs that tool's credit price (set by its creator, usually 1 credit). If the webhook fails or times out after retries, the credits are refunded automatically — you only pay for runs that succeed.",
  },
  {
    q: "Which automation platforms are supported?",
    a: "Anything that exposes an HTTP webhook: n8n, Zapier, Make, a bare Express route, a Cloudflare Worker. AutoHub POSTs your tool's inputs as JSON and reads the response — no SDK required.",
  },
  {
    q: "How are calls secured?",
    a: "Every tool has a unique signing secret. Outbound calls carry X-AutoHub-Timestamp and X-AutoHub-Signature (HMAC-SHA256 over timestamp, execution id, and body) with a ±300-second replay window — the same verification pattern Stripe and GitHub webhooks use. Webhook URLs and secrets are encrypted at rest, and outbound traffic passes an SSRF guard.",
  },
  {
    q: "Can I keep a tool private?",
    a: "Yes. Tools are private by default — visible only to you and the specific users you grant access. Publishing to the public marketplace requires admin approval.",
  },
  {
    q: "What happens when a workflow breaks?",
    a: "A circuit breaker watches every tool. Repeated failures trip it: further calls are rejected fast, callers are refunded, and the tool is marked degraded until it recovers — a dead endpoint never silently eats credits.",
  },
  {
    q: "Do credits expire?",
    a: "Credit packs never expire and stack with any plan. Pro's monthly allowance refreshes with each billing cycle.",
  },
] as const;

export function Faq() {
  return (
    <section id="faq" className="relative py-28 px-5">
      <div className="max-w-3xl mx-auto">
        <Reveal className="mb-12">
          <SectionHeader
            align="center"
            code="SYS.05 / Flight manual"
            title="Questions, answered."
          />
        </Reveal>

        <Reveal delay={100}>
          <Accordion type="single" collapsible className="border-t border-border">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`faq-${i}`} className="border-b border-border">
                <AccordionTrigger className="py-5 text-left font-display font-semibold text-base tracking-tight hover:no-underline hover:text-primary transition-colors [&[data-state=open]]:text-primary">
                  <span className="flex items-baseline gap-4">
                    <span className="font-mono text-[10px] text-muted-foreground tracking-[0.2em] tabular-nums shrink-0" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {f.q}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5 pl-8 text-sm text-muted-foreground leading-relaxed">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
