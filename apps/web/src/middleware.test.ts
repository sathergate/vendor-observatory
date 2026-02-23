import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

// ── Helpers ──────────────────────────────────────────────────────────

function makeRequest(pathname: string, sessionToken?: string): NextRequest {
  const url = `http://localhost${pathname}`;
  const req = new NextRequest(url);
  if (sessionToken) {
    req.cookies.set("session_token", sessionToken);
  }
  return req;
}

// ── Public paths ─────────────────────────────────────────────────────

describe("middleware — public paths", () => {
  it("allows / without auth", () => {
    const res = middleware(makeRequest("/"));
    // NextResponse.next() has no redirect
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /login without auth", () => {
    const res = middleware(makeRequest("/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /signup without auth", () => {
    const res = middleware(makeRequest("/signup"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /api/auth/* without auth", () => {
    const res = middleware(makeRequest("/api/auth/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /_next/* without auth", () => {
    const res = middleware(makeRequest("/_next/data/something"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

// ── Protected page routes ────────────────────────────────────────────

describe("middleware — protected page routes without token", () => {
  it("redirects /vendors to /login", () => {
    const res = middleware(makeRequest("/vendors"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
  });

  it("redirects /benchmarks to /login", () => {
    const res = middleware(makeRequest("/benchmarks"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
  });

  it("redirects /sessions to /login", () => {
    const res = middleware(makeRequest("/sessions"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
  });

  it("redirects /platforms to /login", () => {
    const res = middleware(makeRequest("/platforms"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
  });

  it("redirects /insights to /login", () => {
    const res = middleware(makeRequest("/insights"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
  });
});

// ── Protected API routes ─────────────────────────────────────────────

describe("middleware — protected API routes without token", () => {
  it("returns 401 for /api/vendors", () => {
    const res = middleware(makeRequest("/api/vendors"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for /api/benchmarks", () => {
    const res = middleware(makeRequest("/api/benchmarks"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for /api/sessions/abc", () => {
    const res = middleware(makeRequest("/api/sessions/abc"));
    expect(res.status).toBe(401);
  });
});

// ── Authenticated requests ───────────────────────────────────────────

describe("middleware — authenticated requests", () => {
  it("allows /vendors with valid session token", () => {
    const res = middleware(makeRequest("/vendors", "valid-token"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /api/vendors with valid session token", () => {
    const res = middleware(makeRequest("/api/vendors", "valid-token"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /benchmarks/vendors with valid session token", () => {
    const res = middleware(makeRequest("/benchmarks/vendors", "valid-token"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

// ── New public onboarding paths ──────────────────────────────────────

describe("middleware — new public onboarding paths", () => {
  it("allows /get-started without auth", () => {
    const res = middleware(makeRequest("/get-started"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /get-started/abc123 without auth", () => {
    const res = middleware(makeRequest("/get-started/abc123"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /get-started/abc123/scorecard without auth", () => {
    const res = middleware(makeRequest("/get-started/abc123/scorecard"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /plans without auth", () => {
    const res = middleware(makeRequest("/plans"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /plans?email=x&jobId=y without auth", () => {
    const res = middleware(makeRequest("/plans?email=x&jobId=y"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /payment without auth", () => {
    const res = middleware(makeRequest("/payment"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /api/onboard/analyze without auth", () => {
    const res = middleware(makeRequest("/api/onboard/analyze"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /api/onboard/analyze/abc123 without auth", () => {
    const res = middleware(makeRequest("/api/onboard/analyze/abc123"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /api/onboard/analyze/abc123/email without auth", () => {
    const res = middleware(makeRequest("/api/onboard/analyze/abc123/email"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /api/onboard/email-alert without auth", () => {
    const res = middleware(makeRequest("/api/onboard/email-alert"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
