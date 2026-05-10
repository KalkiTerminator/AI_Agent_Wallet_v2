import * as Sentry from "@sentry/nextjs";

const SENSITIVE_HEADERS = new Set(["authorization", "cookie"]);
const SENSITIVE_BODY_KEYS = new Set(["password", "token", "secret", "mfaToken", "code"]);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  enabled: !!process.env.SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request?.headers) {
      for (const k of SENSITIVE_HEADERS) delete event.request.headers[k];
    }
    if (event.request?.query_string && typeof event.request.query_string === "string") {
      event.request.query_string = event.request.query_string.replace(
        /(token|secret|key)=[^&]+/gi,
        "$1=REDACTED"
      );
    }
    if (event.request?.data && typeof event.request.data === "object") {
      const data = event.request.data as Record<string, unknown>;
      for (const k of SENSITIVE_BODY_KEYS) {
        if (k in data) data[k] = "REDACTED";
      }
    }
    return event;
  },
});
