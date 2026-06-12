import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Consistent empty state — framed, with an icon, message and optional action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("tick-frame border border-border bg-card/40 px-6 py-14 text-center", className)}>
      {Icon && <Icon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />}
      <p className="font-display font-semibold text-sm">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
