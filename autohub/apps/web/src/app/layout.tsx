import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { ToasterProvider } from "@/components/shared/ToasterProvider";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz", "wdth"],
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "AutoHub — Mission Control for AI Tools",
  description:
    "Register webhooks as AI tools, run them from one console, pay per execution. Credit-based AI tools marketplace with HMAC-secured callbacks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${sans.variable} ${mono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <SessionProvider>
            {children}
            <ToasterProvider />
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
