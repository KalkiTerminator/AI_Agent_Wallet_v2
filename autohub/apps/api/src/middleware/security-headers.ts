import type { MiddlewareHandler } from "hono";

/**
 * Adds Pipedream-grade security response headers to every API response.
 * Based on OWASP recommendations and SOC 2 / HIPAA best practices.
 */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Prevent MIME-type sniffing
    c.res.headers.set("X-Content-Type-Options", "nosniff");

    // Prevent clickjacking
    c.res.headers.set("X-Frame-Options", "DENY");

    // Enforce HTTPS for 2 years, include subdomains, eligible for preload
    c.res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );

    // Only send origin on cross-origin requests (no full URL leakage)
    c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // Disable access to browser features we don't use
    c.res.headers.set(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=(), payment=()"
    );

    // Prevent IE from executing downloads in the site context
    c.res.headers.set("X-Download-Options", "noopen");

    // Disable DNS prefetching to avoid leaking user navigation
    c.res.headers.set("X-DNS-Prefetch-Control", "off");

    // Remove server fingerprinting
    c.res.headers.delete("X-Powered-By");
    c.res.headers.delete("Server");
  };
}
