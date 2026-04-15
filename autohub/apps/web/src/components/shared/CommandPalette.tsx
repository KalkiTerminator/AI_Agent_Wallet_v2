"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, BarChart2, Settings, CreditCard, Wrench, Zap } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useTools } from "@/hooks/useTools";
import type { AITool } from "@/types";

interface CommandPaletteProps {
  onSelectTool?: (tool: AITool) => void;
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Usage", href: "/usage", icon: BarChart2 },
  { label: "My Tools", href: "/tools/mine", icon: Wrench },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function CommandPalette({ onSelectTool }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { tools } = useTools();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handleNav(href: string) {
    setOpen(false);
    router.push(href);
  }

  function handleTool(tool: AITool) {
    setOpen(false);
    if (onSelectTool) {
      onSelectTool(tool);
    } else {
      router.push(`/tools/${tool.id}`);
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages and tools..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
            <CommandItem key={href} value={label} onSelect={() => handleNav(href)}>
              <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>

        {tools.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tools">
              {tools.map((tool) => (
                <CommandItem
                  key={tool.id}
                  value={`${tool.name} ${tool.category}`}
                  onSelect={() => handleTool(tool)}
                >
                  <span className="mr-2 text-base leading-none">{tool.iconUrl ?? <Zap className="h-4 w-4" />}</span>
                  <span className="flex-1 truncate">{tool.name}</span>
                  <span className="ml-2 text-[10px] text-muted-foreground shrink-0">
                    {tool.category}
                  </span>
                  <span className="ml-2 text-[10px] font-mono text-muted-foreground shrink-0">
                    {tool.creditCost}cr
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;
