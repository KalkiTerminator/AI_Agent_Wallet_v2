import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const betterStackToken = process.env.BETTERSTACK_TOKEN;

// In production, pino.transport() runs in a worker thread — logs are
// dispatched asynchronously and never block the request handler.
const transport: pino.TransportSingleOptions | undefined = isDev
  ? { target: "pino-pretty", options: { colorize: true } }
  : betterStackToken
  ? {
      target: "@logtail/pino",
      options: {
        sourceToken: betterStackToken,
        endpoint: "https://s2416489.eu-fsn-3.betterstackdata.com",
      },
    }
  : undefined;

export const logger = pino(
  {
    level: isDev ? "debug" : "info",
    base: { service: "autohub-api" },
    // Disable sync flushing — let the worker thread handle I/O
    ...(isDev ? {} : { formatters: { level: (label) => ({ level: label }) } }),
  },
  transport ? pino.transport(transport) : pino.destination({ sync: false })
);
