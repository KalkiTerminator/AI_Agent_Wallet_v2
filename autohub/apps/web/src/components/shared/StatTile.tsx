import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Telemetry stat box — mono label, oversized tabular value. */
export function StatTile({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("tick-frame bg-card border border-border p-4", className)}>
      <div className="flex items-center justify-between">
        <p className="microlabel">{label}</p>
        {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
      </div>
      <p className="font-display text-2xl font-bold tabular-nums leading-none mt-2.5">{value}</p>
    </div>
  );
}
