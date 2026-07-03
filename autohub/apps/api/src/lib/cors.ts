/**
 * Build the CORS origin allowlist from a comma-separated env value.
 *
 * Deployment reality: the single most common CORS outage is the allowlist
 * saying `https://autohub.fun` while users browse `https://www.autohub.fun`
 * (or a trailing slash / stray space in the env var). Every blocked response
 * surfaces in the UI as an opaque "Something went wrong", so normalize
 * defensively:
 *   - trim whitespace and trailing slashes, lowercase
 *   - for every origin, also allow its www./apex twin on the same scheme+port
 */
export function buildCorsAllowlist(raw: string): Set<string> {
  const allow = new Set<string>();
  for (const entry of raw.split(",")) {
    const cleaned = entry.trim().replace(/\/+$/, "").toLowerCase();
    if (!cleaned) continue;
    allow.add(cleaned);
    try {
      const u = new URL(cleaned);
      const twinHost = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
      allow.add(`${u.protocol}//${twinHost}${u.port ? `:${u.port}` : ""}`);
    } catch {
      // not a parseable URL — keep the cleaned literal only
    }
  }
  return allow;
}

export function isOriginAllowed(allowlist: Set<string>, origin: string): boolean {
  return allowlist.has(origin.trim().replace(/\/+$/, "").toLowerCase());
}
