"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Root-level error boundary. Catches React rendering errors that escape
 * route-level error.tsx boundaries (including errors in the root layout)
 * and reports them to Sentry. Must render its own <html>/<body> because
 * the root layout itself may have crashed — styles are inlined for the
 * same reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsl(80 7% 5%)",
          color: "hsl(60 14% 92%)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 420 }}>
          <p style={{ fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: "hsl(72 95% 60%)", marginBottom: 16 }}>
            SYS.ERR / Unexpected fault
          </p>
          <h1 style={{ fontSize: 22, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: "hsl(70 5% 54%)", lineHeight: 1.6, margin: "0 0 24px" }}>
            The error has been reported. Try again, or reload the page.
          </p>
          <button
            onClick={reset}
            style={{
              background: "hsl(72 95% 60%)",
              color: "hsl(80 10% 6%)",
              border: "none",
              padding: "12px 28px",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
