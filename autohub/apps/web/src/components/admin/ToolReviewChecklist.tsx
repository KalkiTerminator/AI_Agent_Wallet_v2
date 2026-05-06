"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

const CHECKLIST_ITEMS = [
  { key: "webhookDomainVerified", label: "Webhook domain verified", tip: "The tool's webhook domain has a verified TXT record or is admin-submitted." },
  { key: "noPersonalDataCollected", label: "No unnecessary personal data", tip: "Input fields don't collect PII beyond what's needed for the tool's function." },
  { key: "outputTypeAppropriate", label: "Output type is appropriate", tip: "The declared output type matches what the webhook actually returns." },
  { key: "creditCostReasonable", label: "Credit cost is reasonable", tip: "Credit cost is proportional to the tool's complexity and resource use." },
  { key: "descriptionAccurate", label: "Description is accurate", tip: "The name and description accurately represent what the tool does." },
  { key: "noMaliciousInputFields", label: "No malicious input fields", tip: "Input fields don't attempt to collect credentials, tokens, or other sensitive data." },
] as const;

type ChecklistKey = typeof CHECKLIST_ITEMS[number]["key"];
export type ReviewChecklist = Record<ChecklistKey, boolean>;

interface Props {
  value: Partial<ReviewChecklist>;
  onChange: (value: Partial<ReviewChecklist>) => void;
}

export function ToolReviewChecklist({ value, onChange }: Props) {
  const allChecked = CHECKLIST_ITEMS.every((item) => value[item.key] === true);

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Review Checklist</p>
      {CHECKLIST_ITEMS.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <Checkbox
            id={item.key}
            checked={value[item.key] === true}
            onCheckedChange={(checked) =>
              onChange({ ...value, [item.key]: checked === true })
            }
          />
          <Label htmlFor={item.key} className="text-xs cursor-pointer flex-1">{item.label}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[200px] text-xs">
              {item.tip}
            </TooltipContent>
          </Tooltip>
        </div>
      ))}
      {!allChecked && (
        <p className="text-[10px] text-muted-foreground">All items must be checked to approve.</p>
      )}
    </div>
  );
}

export function isChecklistComplete(checklist: Partial<ReviewChecklist>): checklist is ReviewChecklist {
  return CHECKLIST_ITEMS.every((item) => checklist[item.key] === true);
}
