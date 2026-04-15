import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen gradient-mesh aurora-bg">
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-4">
        <h1 className="text-5xl font-display font-bold text-gradient mb-4">AutoHub</h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl">
          The credit-based AI tools marketplace. Access powerful AI automation tools with flexible credit packages.
        </p>
        <div className="flex gap-4">
          <Link href="/auth/login" className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
            Get Started
          </Link>
          <Link href="/dashboard" className="px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-secondary transition-colors">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
