import { lookup } from "dns/promises";
import { isIP } from "net";

const BLOCKED_CIDRS: [number, number, number][] = [
  // [network_int, mask_int, bits] — IPv4 only; IPv6 handled separately
  [toInt("10.0.0.0"), toInt("255.0.0.0"), 8],
  [toInt("172.16.0.0"), toInt("255.240.0.0"), 12],
  [toInt("192.168.0.0"), toInt("255.255.0.0"), 16],
  [toInt("127.0.0.0"), toInt("255.0.0.0"), 8],
  [toInt("169.254.0.0"), toInt("255.255.0.0"), 16], // link-local / AWS metadata
  [toInt("100.64.0.0"), toInt("255.192.0.0"), 10],  // shared address space
  [toInt("0.0.0.0"), toInt("255.0.0.0"), 8],
];

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.azure.com",
  "169.254.169.254",
  "fd00::ec2",
]);

// Blocked IPv6 prefixes as strings (prefix match)
const BLOCKED_IPV6_PREFIXES = [
  "::1",        // loopback
  "fc",         // fc00::/7 unique local
  "fd",         // fd00::/8 unique local
  "fe80",       // fe80::/10 link-local
];

function toInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  const addr = toInt(ip);
  return BLOCKED_CIDRS.some(([net, mask]) => (addr & mask) >>> 0 === net);
}

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return BLOCKED_IPV6_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isBlockedIP(ip: string): boolean {
  if (isIP(ip) === 4) return isBlockedIPv4(ip);
  if (isIP(ip) === 6) return isBlockedIPv6(ip);
  return false;
}

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSRFError";
  }
}

/**
 * Validates a URL is safe to call as an outbound webhook target.
 * Returns the resolved IP so the caller can pin it to defeat DNS rebinding.
 *
 * Rejects:
 *  - non-https schemes
 *  - blocked hostnames (localhost, cloud metadata endpoints)
 *  - private/loopback/link-local IP ranges
 *
 * Call this on every outbound fetch — not just at tool creation — to defeat DNS rebinding.
 */
export async function validateOutboundUrl(rawUrl: string): Promise<{ safeUrl: string; resolvedIp: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SSRFError("Invalid URL format");
  }

  if (parsed.protocol !== "https:") {
    throw new SSRFError("Only HTTPS webhook URLs are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(hostname)) {
    throw new SSRFError(`Blocked hostname: ${hostname}`);
  }

  // If the hostname is already an IP, check it directly
  if (isIP(hostname)) {
    if (isBlockedIP(hostname)) {
      throw new SSRFError(`Blocked IP address: ${hostname}`);
    }
    return { safeUrl: rawUrl, resolvedIp: hostname };
  }

  // Resolve DNS and check all returned addresses
  let addresses: string[];
  try {
    const results = await lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new SSRFError(`Cannot resolve hostname: ${hostname}`);
  }

  if (addresses.length === 0) {
    throw new SSRFError(`No DNS records for hostname: ${hostname}`);
  }

  for (const addr of addresses) {
    if (isBlockedIP(addr)) {
      throw new SSRFError(`Hostname ${hostname} resolves to blocked IP: ${addr}`);
    }
  }

  // Pin first resolved IP — caller uses this to prevent DNS rebinding
  return { safeUrl: rawUrl, resolvedIp: addresses[0] };
}
