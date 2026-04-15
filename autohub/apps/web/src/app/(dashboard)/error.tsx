"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <h2 className="text-xl font-display font-bold text-destructive">Dashboard error</h2>
      <button onClick={reset} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">Retry</button>
    </div>
  );
}
