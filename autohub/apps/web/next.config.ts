import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@autohub/shared"],
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  autoInstrumentServerFunctions: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  telemetry: false,
});
