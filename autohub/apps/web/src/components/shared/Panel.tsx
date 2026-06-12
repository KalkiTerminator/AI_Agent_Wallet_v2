import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Instrument-panel surface — the Mission Control replacement for `.glass rounded-xl`.
 * Tick-framed card on the card surface. `signal` lights the corner ticks chartreuse.
 */
export function Panel({
  children,
  className,
  signal = false,
}: {
  children: ReactNode;
  className?: string;
  signal?: boolean;
}) {
  return (
    <div className={cn("tick-frame bg-card border border-border", signal && "tick-signal", className)}>
      {children}
    </div>
  );
}
