import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@autohub/shared"],
};

export default withSentryConfig(nextConfig, {
  // Suppress Sentry CLI output unless debugging
  silent: !process.env.CI,
  // Automatically instrument server components / API routes
  autoInstrumentServerFunctions: true,
});
