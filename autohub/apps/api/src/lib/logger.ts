import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const betterStackToken = process.env.BETTERSTACK_TOKEN;

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
  },
  transport ? pino.transport(transport) : undefined
);
