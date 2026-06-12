import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Table/list shell — tick-framed surface with an optional mono title bar.
 * Wrap a <Table> (or any rows) so data lists match the instrument aesthetic.
 */
export function DataPanel({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("tick-frame bg-card border border-border overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/70">
          {title && <p className="microlabel">{title}</p>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
