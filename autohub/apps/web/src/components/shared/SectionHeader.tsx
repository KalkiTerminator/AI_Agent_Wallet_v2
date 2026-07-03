import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Landing/console section header — SYS.xx microlabel, display title,
 * optional lede. Owns the section-numbering voice so SYS codes stay
 * unique per page (pass them in order; never hardcode duplicates).
 */
export function SectionHeader({
  code,
  title,
  lede,
  align = "left",
  className,
}: {
  code: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", align === "center" && "text-center", className)}>
      <p className="microlabel microlabel-signal flex items-center gap-2.5 justify-start data-[align=center]:justify-center" data-align={align}>
        <span className={cn("inline-block h-px w-6 bg-signal/60", align === "center" && "hidden")} aria-hidden />
        {code}
      </p>
      <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight leading-[1.05]">{title}</h2>
      {lede && <p className={cn("text-muted-foreground text-sm sm:text-base max-w-xl leading-relaxed", align === "center" && "mx-auto")}>{lede}</p>}
    </div>
  );
}
