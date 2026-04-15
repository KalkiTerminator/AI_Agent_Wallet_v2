import { Button } from "@/components/ui/button";
import { LayoutGrid, Grid3X3, List } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type DashboardLayout = "compact" | "comfortable" | "list";

interface LayoutToggleProps {
  layout: DashboardLayout;
  onChange: (layout: DashboardLayout) => void;
}

const options: { value: DashboardLayout; icon: typeof LayoutGrid; label: string }[] = [
  { value: "compact", icon: Grid3X3, label: "Compact" },
  { value: "comfortable", icon: LayoutGrid, label: "Comfortable" },
  { value: "list", icon: List, label: "List" },
];

export function LayoutToggle({ layout, onChange }: LayoutToggleProps) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg glass-subtle">
      {options.map((opt) => (
        <Tooltip key={opt.value}>
          <TooltipTrigger asChild>
            <Button
              variant={layout === opt.value ? "default" : "ghost"}
              size="sm"
              className="h-6 w-6 p-0 rounded-md"
              onClick={() => onChange(opt.value)}
            >
              <opt.icon className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">{opt.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
