import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-strong border-b border-border/50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-display font-bold text-base tracking-tight">AutoHub</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</Link>
          <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
          <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign In</Link>
        </nav>
        <Button asChild variant="hero" size="sm" className="border-glow">
          <Link href="/auth/signup">Get Started Free</Link>
        </Button>
      </div>
    </header>
  );
}
