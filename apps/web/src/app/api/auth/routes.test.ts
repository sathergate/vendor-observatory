import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock auth lib ────────────────────────────────────────────────────

const mockCreateUser = vi.fn();
const mockVerifyUser = vi.fn();
const mockCreateSession = vi.fn();
const mockDeleteSession = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockHasActivePayment = vi.fn();
const mockGetUserSubscription = vi.fn();

vi.mock("@/lib/auth", () => ({
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  verifyUser: (...args: unknown[]) => mockVerifyUser(...args),
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  getCurrentUser: () => mockGetCurrentUser(),
  hasActivePayment: (...args: unknown[]) => mockHasActivePayment(...args),
  getUserSubscription: (...args: unknown[]) => mockGetUserSubscription(...args),
  BYPASS_EMAIL: "test@test.com",
  BYPASS_VENDOR: "neon",
  sessionCookieOptions: (token: string) => ({
    name: "session_token",
    value: token,
    httpOnly: true,
    path: "/",
    maxAge: 2592000,
    sameSite: "lax",
  }),
  deleteSessionCookie: () => ({
    name: "session_token",
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  }),
}));

// Mock next/headers cookies for the logout route
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── POST /api/auth/signup ────────────────────────────────────────────

describe("POST /api/auth/signup", () => {
  async function callSignup(body: unknown) {
    const { POST } = await import("./signup/route");
    return POST(jsonRequest(body));
  }

  it("creates user and returns 200 with session cookie", async () => {
    mockCreateUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockCreateSession.mockResolvedValue("tok-123");

    const res = await callSignup({ email: "a@b.com", password: "pass" });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.user).toEqual({ id: "u1", email: "a@b.com" });

    const cookie = res.cookies.get("session_token");
    expect(cookie?.value).toBe("tok-123");
  });

  it("returns 400 when email is missing", async () => {
    const res = await callSignup({ password: "pass" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/email/i);
  });

  it("returns 400 when password is missing", async () => {
    const res = await callSignup({ email: "a@b.com" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/password/i);
  });

  it("returns 409 when email is already taken", async () => {
    mockCreateUser.mockResolvedValue(null);

    const res = await callSignup({ email: "dup@b.com", password: "pass" });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});

// ── POST /api/auth/login ─────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  async function callLogin(body: unknown) {
    const { POST } = await import("./login/route");
    return POST(jsonRequest(body));
  }

  it("logs in and returns 200 with session cookie", async () => {
    mockVerifyUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockCreateSession.mockResolvedValue("tok-456");

    const res = await callLogin({ email: "a@b.com", password: "pass" });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.user).toEqual({ id: "u1", email: "a@b.com" });

    const cookie = res.cookies.get("session_token");
    expect(cookie?.value).toBe("tok-456");
  });

  it("returns 400 when email is missing", async () => {
    const res = await callLogin({ password: "pass" });
    expect(res.status).toBe(400);
  });

  it("returns 401 with wrong credentials", async () => {
    mockVerifyUser.mockResolvedValue(null);

    const res = await callLogin({ email: "a@b.com", password: "wrong" });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/invalid/i);
  });
});

// ── POST /api/auth/logout ────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  async function callLogout() {
    const { POST } = await import("./logout/route");
    return POST();
  }

  it("clears session and returns ok", async () => {
    mockCookieGet.mockReturnValue({ value: "tok-789" });
    mockDeleteSession.mockResolvedValue(undefined);

    const res = await callLogout();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);

    expect(mockDeleteSession).toHaveBeenCalledWith("tok-789");

    const cookie = res.cookies.get("session_token");
    expect(cookie?.value).toBe("");
  });

  it("returns ok even with no session cookie", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const res = await callLogout();
    expect(res.status).toBe(200);
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  async function callMe() {
    const { GET } = await import("./me/route");
    return GET();
  }

  it("returns user when authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockHasActivePayment.mockResolvedValue(true);
    mockGetUserSubscription.mockResolvedValue({ plan: "starter", status: "active" });

    const res = await callMe();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.user).toEqual({ id: "u1", email: "a@b.com" });
    expect(data.paymentActive).toBe(true);
    expect(data.subscription).toEqual({ plan: "starter", status: "active" });
  });

  it("returns vendor for bypass/test account", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u2", email: "test@test.com" });
    mockHasActivePayment.mockResolvedValue(true);
    mockGetUserSubscription.mockResolvedValue(null);

    const res = await callMe();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.vendor).toBe("neon");
  });

  it("does not return vendor for regular accounts", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    mockHasActivePayment.mockResolvedValue(true);
    mockGetUserSubscription.mockResolvedValue({ plan: "starter", status: "active" });

    const res = await callMe();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.vendor).toBeUndefined();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await callMe();
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.user).toBeNull();
  });
});
