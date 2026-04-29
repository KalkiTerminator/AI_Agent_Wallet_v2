"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
    // Surface to console for debugging in production
    console.error("[DashboardError]", error.message, error.stack, error.digest);
  }, [error]);
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-display font-bold text-destructive">Dashboard error</h2>
      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded-lg w-full overflow-auto whitespace-pre-wrap">
        {error.message || "Unknown error"}
        {error.digest ? `\n\nDigest: ${error.digest}` : ""}
      </pre>
      <button onClick={reset} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">Retry</button>
    </div>
  );
}
