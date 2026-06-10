import { AuthShell } from "@/components/auth/AuthShell";

export default function VerifyPendingPage() {
  return (
    <AuthShell
      step="ACCESS / VERIFY"
      title="Check your email"
      subtitle="A verification link is on its way."
    >
      <div className="space-y-5 py-2">
        <div className="border border-border bg-muted/30 px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          <p className="text-primary">→ verification link dispatched</p>
          <p>→ awaiting confirmation…</p>
          <p className="caret-blink" />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We sent a verification link to your email address. Click the link to activate your account.
        </p>
        <p className="text-xs text-muted-foreground">
          Didn&apos;t receive it? Check your spam folder or{" "}
          <a href="/auth/login" className="text-primary hover:underline">sign in</a>{" "}
          to resend.
        </p>
      </div>
    </AuthShell>
  );
}
