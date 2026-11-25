import { describe, expect, it } from "vitest";
import { checkRateLimit, clearRateLimits, clientIpFromHeaders } from "./rate-limit";

describe("rate-limit", () => {
  it("allows requests up to limit and blocks afterwards", () => {
    clearRateLimits();
    const a = checkRateLimit("test:user1", { limit: 2, windowMs: 60_000 }, 1000);
    const b = checkRateLimit("test:user1", { limit: 2, windowMs: 60_000 }, 2000);
    const c = checkRateLimit("test:user1", { limit: 2, windowMs: 60_000 }, 3000);
    expect(a.allowed).toBe(true);
    expect(a.remaining).toBe(1);
    expect(b.allowed).toBe(true);
    expect(b.remaining).toBe(0);
    expect(c.allowed).toBe(false);
    expect(c.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("slides the window and allows requests again after windowMs", () => {
    clearRateLimits();
    checkRateLimit("test:user2", { limit: 1, windowMs: 10_000 }, 1000);
    const blocked = checkRateLimit("test:user2", { limit: 1, windowMs: 10_000 }, 5000);
    const allowed = checkRateLimit("test:user2", { limit: 1, windowMs: 10_000 }, 12_000);
    expect(blocked.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });

  it("extracts IP from forwarded headers", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.5");
  });
});
