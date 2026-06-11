import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DNS so we can control what hostnames resolve to.
const mockLookup = vi.fn();
vi.mock("dns/promises", () => ({
  lookup: (...args: unknown[]) => mockLookup(...args),
}));

const { validateOutboundUrl, safeFetch, SSRFError } = await import("./url-guard.js");

describe("validateOutboundUrl", () => {
  beforeEach(() => mockLookup.mockReset());

  it("rejects non-https schemes", async () => {
    await expect(validateOutboundUrl("http://example.com/hook")).rejects.toBeInstanceOf(SSRFError);
  });

  it("rejects localhost", async () => {
    await expect(validateOutboundUrl("https://localhost/hook")).rejects.toBeInstanceOf(SSRFError);
  });

  it("rejects the cloud metadata IP directly", async () => {
    await expect(validateOutboundUrl("https://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(SSRFError);
  });

  it("rejects a hostname that resolves to a private IP", async () => {
    mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(validateOutboundUrl("https://evil.example.com/hook")).rejects.toBeInstanceOf(SSRFError);
  });

  it("rejects a hostname that resolves to link-local metadata", async () => {
    mockLookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(validateOutboundUrl("https://rebind.example.com/hook")).rejects.toBeInstanceOf(SSRFError);
  });

  it("allows a public hostname", async () => {
    mockLookup.mockResolvedValue([{ address: "104.21.6.42", family: 4 }]);
    const { resolvedIp } = await validateOutboundUrl("https://hooks.n8n.cloud/webhook/x");
    expect(resolvedIp).toBe("104.21.6.42");
  });
});

describe("safeFetch — redirect SSRF defense", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => mockLookup.mockReset());
  afterEach(() => { globalThis.fetch = realFetch; });

  it("blocks a redirect from an allowed host to the metadata IP", async () => {
    mockLookup.mockResolvedValue([{ address: "104.21.6.42", family: 4 }]);
    // First hop: allowed host returns a 302 to the metadata IP.
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } })
    ) as unknown as typeof fetch;

    await expect(
      safeFetch("https://hooks.n8n.cloud/webhook/x", { method: "POST" })
    ).rejects.toBeInstanceOf(SSRFError);
  });

  it("passes through a direct 200 with no redirect", async () => {
    mockLookup.mockResolvedValue([{ address: "104.21.6.42", family: 4 }]);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    ) as unknown as typeof fetch;

    const res = await safeFetch("https://hooks.n8n.cloud/webhook/x", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("uses redirect:manual so fetch never auto-follows", async () => {
    mockLookup.mockResolvedValue([{ address: "104.21.6.42", family: 4 }]);
    const spy = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    await safeFetch("https://hooks.n8n.cloud/webhook/x", { method: "POST" });
    expect(spy).toHaveBeenCalledWith(
      "https://hooks.n8n.cloud/webhook/x",
      expect.objectContaining({ redirect: "manual" })
    );
  });
});
