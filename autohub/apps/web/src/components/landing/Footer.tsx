import Link from "next/link";
import { Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-10 px-4">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md gradient-primary flex items-center justify-center">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-display font-bold text-sm">AutoHub</span>
        </div>
        <nav className="flex items-center gap-6 text-xs text-muted-foreground">
          <Link href="/features" className="hover:text-foreground transition-colors">Features</Link>
          <Link href="#pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          <Link href="/auth/login" className="hover:text-foreground transition-colors">Sign In</Link>
          <Link href="/auth/signup" className="hover:text-foreground transition-colors">Sign Up</Link>
        </nav>
        <p className="text-xs text-muted-foreground">© 2026 AutoHub. All rights reserved.</p>
      </div>
    </footer>
  );
}
