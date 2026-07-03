import { describe, it, expect } from "vitest";
import { buildCorsAllowlist, isOriginAllowed } from "./cors.js";

describe("buildCorsAllowlist", () => {
  it("allows the www twin when the apex is configured", () => {
    const allow = buildCorsAllowlist("https://autohub.fun");
    expect(isOriginAllowed(allow, "https://autohub.fun")).toBe(true);
    expect(isOriginAllowed(allow, "https://www.autohub.fun")).toBe(true);
  });

  it("allows the apex twin when www is configured", () => {
    const allow = buildCorsAllowlist("https://www.autohub.fun");
    expect(isOriginAllowed(allow, "https://autohub.fun")).toBe(true);
  });

  it("survives trailing slashes, whitespace, and case drift", () => {
    const allow = buildCorsAllowlist(" https://Autohub.fun/ , http://localhost:3000 ");
    expect(isOriginAllowed(allow, "https://autohub.fun")).toBe(true);
    expect(isOriginAllowed(allow, "http://localhost:3000")).toBe(true);
    expect(isOriginAllowed(allow, "https://www.autohub.fun/")).toBe(true);
  });

  it("preserves ports on the twin", () => {
    const allow = buildCorsAllowlist("http://localhost:3100");
    expect(isOriginAllowed(allow, "http://www.localhost:3100")).toBe(true);
    expect(isOriginAllowed(allow, "http://localhost:4000")).toBe(false);
  });

  it("still rejects unrelated origins", () => {
    const allow = buildCorsAllowlist("https://autohub.fun,https://staging.autohub.fun");
    expect(isOriginAllowed(allow, "https://evil.example")).toBe(false);
    expect(isOriginAllowed(allow, "https://autohub.fun.evil.example")).toBe(false);
    expect(isOriginAllowed(allow, "https://staging.autohub.fun")).toBe(true);
  });

  it("ignores empty entries", () => {
    const allow = buildCorsAllowlist("https://autohub.fun,,");
    expect(isOriginAllowed(allow, "")).toBe(false);
  });
});
