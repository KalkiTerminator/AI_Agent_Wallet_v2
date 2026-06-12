import type { ReactNode } from "react";

/**
 * Page header with a SYS.xx mono microlabel + display title, optional actions.
 */
export function PageHeader({
  label,
  title,
  description,
  actions,
}: {
  label: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1.5 min-w-0">
        <p className="microlabel microlabel-signal">{label}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight leading-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
