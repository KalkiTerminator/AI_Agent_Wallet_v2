"use client";
import { Toaster } from "sonner";
import { useTheme } from "next-themes";

/** Global toast surface, themed to the Mission Control aesthetic (squared, mono). */
export function ToasterProvider() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={(theme as "light" | "dark" | "system") ?? "dark"}
      position="bottom-right"
      toastOptions={{
        style: {
          borderRadius: "2px",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
        },
      }}
    />
  );
}
