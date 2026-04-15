"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, BarChart2, CreditCard, ArrowRight } from "lucide-react";

const STORAGE_KEY = "autohub_onboarded";

const STEPS = [
  {
    icon: Zap,
    title: "Run AI tools instantly",
    description:
      "Browse hundreds of AI-powered tools. Click Run, fill in your inputs, and get results in seconds.",
  },
  {
    icon: BarChart2,
    title: "Track your usage",
    description:
      "Every execution is logged in Usage History with credit costs, status, and outputs.",
  },
  {
    icon: CreditCard,
    title: "Credits keep things simple",
    description:
      "You started with free credits. Buy more anytime or subscribe for a monthly top-up.",
  },
];

export function OnboardingDialog() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    const userId = session?.user?.email ?? "anon";
    const key = `${STORAGE_KEY}_${userId}`;
    if (!localStorage.getItem(key)) {
      setOpen(true);
    }
  }, [status, session]);

  function dismiss() {
    const userId = session?.user?.email ?? "anon";
    const key = `${STORAGE_KEY}_${userId}`;
    localStorage.setItem(key, "1");
    setOpen(false);
  }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }

  function handleGoToBilling() {
    dismiss();
    router.push("/billing");
  }

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="items-center text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
            <Icon className="h-6 w-6 text-white" />
          </div>
          <DialogTitle className="text-base">{current.title}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {current.description}
          </DialogDescription>
        </DialogHeader>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 py-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-4 bg-primary" : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleNext}>
            {isLast ? "Get started" : "Next"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          {isLast && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleGoToBilling}
            >
              <CreditCard className="h-3.5 w-3.5" />
              Buy credits
            </Button>
          )}
          <button
            onClick={dismiss}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors text-center"
          >
            Skip intro
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default OnboardingDialog;
