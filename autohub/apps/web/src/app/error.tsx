"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h2 className="text-2xl font-display font-bold text-destructive">Something went wrong</h2>
      <p className="text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">Try again</button>
    </div>
  );
}
