"use client";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Grid3X3, List } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type DashboardLayout = "grid" | "comfortable" | "list";

interface LayoutToggleProps {
  layout: DashboardLayout;
  onChange: (layout: DashboardLayout) => void;
}

const options: { value: DashboardLayout; icon: typeof LayoutGrid; label: string }[] = [
  { value: "grid", icon: Grid3X3, label: "Compact grid" },
  { value: "comfortable", icon: LayoutGrid, label: "Comfortable grid" },
  { value: "list", icon: List, label: "List" },
];

export function LayoutToggle({ layout, onChange }: LayoutToggleProps) {
  return (
    <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
      {options.map((opt) => (
        <Tooltip key={opt.value}>
          <TooltipTrigger asChild>
            <Button
              variant={layout === opt.value ? "secondary" : "ghost"}
              size="sm"
              className="h-6 w-6 p-0 rounded-sm"
              onClick={() => onChange(opt.value)}
              aria-label={opt.label}
            >
              <opt.icon className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="font-mono text-[10px] uppercase tracking-[0.12em]">{opt.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
