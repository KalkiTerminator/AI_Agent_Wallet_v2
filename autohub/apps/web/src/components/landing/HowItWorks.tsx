import { Reveal } from "@/components/shared/Reveal";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { FigCaption } from "@/components/shared/FigCaption";

const STEPS = [
  {
    code: "REG",
    title: "Register a webhook",
    body: "Paste the HTTP endpoint of any n8n, Zapier or Make workflow. Define its input fields, credit cost, and whether it runs sync or async. The URL is encrypted at rest.",
  },
  {
    code: "SIG",
    title: "Approve & arm",
    body: "An admin reviews the tool and it receives a unique signing secret. From then on every outbound call carries an HMAC-SHA256 signature your workflow can verify — the same pattern Stripe and GitHub use.",
  },
  {
    code: "EXE",
    title: "Execute & meter",
    body: "Users run the tool from the console or the API. Credits are debited in a two-phase commit and refunded automatically if the run fails. Every execution is logged and auditable.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="relative py-28 px-5 overflow-hidden">
      <div className="relative max-w-6xl mx-auto">
        <Reveal className="mb-14 grid md:grid-cols-12 gap-6 items-end">
          <div className="md:col-span-7">
            <SectionHeader
              code="SYS.02 / Flight plan"
              title={<>From webhook to metered tool in <span className="text-gradient">three steps.</span></>}
            />
          </div>
          <p className="md:col-span-5 text-sm text-muted-foreground leading-relaxed md:text-right">
            No SDK, no code changes to your workflow. If it speaks HTTP,
            it can fly here.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map((s, i) => (
            <Reveal key={s.code} delay={i * 110} className="h-full">
              <article className="tick-frame relative h-full bg-card border border-border p-6 pt-7 transition-all duration-500 ease-out-expo hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-glow">
                <div className="flex items-baseline justify-between mb-5">
                  <span className="font-display text-4xl font-bold text-stroke select-none" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="microlabel">{s.code}</span>
                </div>
                <h3 className="font-display font-semibold text-lg tracking-tight mb-2.5">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              </article>
            </Reveal>
          ))}
        </div>

        {/* Signature spec strip — the real headers a workflow verifies */}
        <Reveal delay={200} className="mt-8">
          <div className="tick-frame bg-card/60 border border-border px-5 py-4 overflow-x-auto">
            <div className="flex items-center gap-6 font-mono text-[11px] leading-relaxed whitespace-nowrap">
              <span className="microlabel microlabel-signal shrink-0">Callback contract</span>
              <code className="text-muted-foreground">
                X-AutoHub-Timestamp: <span className="text-foreground">1783020000</span>
              </code>
              <code className="text-muted-foreground">
                X-AutoHub-Signature: <span className="text-foreground">sha256=hmac(secret, ts.id.body)</span>
              </code>
              <span className="text-primary">± 300s replay window</span>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <FigCaption n="02">verification headers sent with every call</FigCaption>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
