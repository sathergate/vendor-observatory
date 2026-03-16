import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock fns ──────────────────────────────────────────────────

const mockQuery = vi.fn();
const mockCookieGet = vi.fn();

// Re-register mocks after each resetModules so dynamic imports pick them up
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
  mockQuery.mockReset();
  mockCookieGet.mockReset();

  vi.doMock("pg", () => {
    return {
      Pool: class MockPool {
        query = mockQuery;
      },
    };
  });

  vi.doMock("next/headers", () => ({
    cookies: vi.fn(async () => ({ get: mockCookieGet })),
  }));

  // Mock @/auth to avoid pulling in next-auth during tests
  vi.doMock("@/auth", () => ({
    auth: vi.fn(async () => null),
  }));

  // Mock bcryptjs
  vi.doMock("bcryptjs", () => ({
    default: {
      hash: vi.fn(async (pw: string) => `hashed:${pw}`),
      compare: vi.fn(async (pw: string, hash: string) => hash === `hashed:${pw}` || hash === pw),
    },
  }));
});

async function loadAuth() {
  return import("./auth");
}

// ── sessionCookieOptions / deleteSessionCookie ───────────────────────

describe("sessionCookieOptions", () => {
  it("returns correct cookie config", async () => {
    const { sessionCookieOptions } = await loadAuth();
    const opts = sessionCookieOptions("tok-123");
    expect(opts).toEqual({
      name: "session_token",
      value: "tok-123",
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
    });
  });
});

describe("deleteSessionCookie", () => {
  it("returns cookie config with maxAge 0", async () => {
    const { deleteSessionCookie } = await loadAuth();
    const opts = deleteSessionCookie();
    expect(opts).toEqual({
      name: "session_token",
      value: "",
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
  });
});

// ── createUser ───────────────────────────────────────────────────────

describe("createUser", () => {
  it("inserts a user with hashed password and returns id + email", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id, email FROM users")) {
        return { rows: [{ id: "test-id", email: "a@b.com" }] };
      }
      return { rows: [] };
    });
    const { createUser } = await loadAuth();

    const user = await createUser("a@b.com", "pass");
    expect(user).not.toBeNull();
    expect(user!.email).toBe("a@b.com");

    // Should have called INSERT INTO users with hashed password
    const insertCall = mockQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("INSERT INTO users"),
    );
    expect(insertCall).toBeDefined();
  });

  it("returns null when DATABASE_URL is not set", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { createUser } = await loadAuth();
    const user = await createUser("a@b.com", "pass");
    expect(user).toBeNull();
  });
});

// ── verifyUser ───────────────────────────────────────────────────────

describe("verifyUser", () => {
  it("returns user when credentials match (Auth.js users table)", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id, email") && sql.includes("FROM users")) {
        return { rows: [{ id: "u1", email: "a@b.com", passwordHash: "hashed:pass" }] };
      }
      return { rows: [] };
    });

    const { verifyUser } = await loadAuth();
    const user = await verifyUser("a@b.com", "pass");
    expect(user).toEqual({ id: "u1", email: "a@b.com" });
  });

  it("falls back to legacy auth_users table", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("FROM users")) {
        return { rows: [] };
      }
      if (typeof sql === "string" && sql.includes("FROM auth_users")) {
        return { rows: [{ id: "u2", email: "a@b.com", password: "hashed:pass" }] };
      }
      return { rows: [] };
    });

    const { verifyUser } = await loadAuth();
    const user = await verifyUser("a@b.com", "pass");
    expect(user).toEqual({ id: "u2", email: "a@b.com" });
  });

  it("returns null when no match", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { verifyUser } = await loadAuth();
    const user = await verifyUser("wrong@b.com", "bad");
    expect(user).toBeNull();
  });
});

// ── createSession ────────────────────────────────────────────────────

describe("createSession", () => {
  it("inserts session and returns a token", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { createSession } = await loadAuth();

    const token = await createSession("u1");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);

    const insertCall = mockQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("INSERT INTO auth_sessions"),
    );
    expect(insertCall).toBeDefined();
  });

  it("still returns a token when pool is unavailable", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { createSession } = await loadAuth();
    const token = await createSession("u1");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });
});

// ── deleteSession ────────────────────────────────────────────────────

describe("deleteSession", () => {
  it("calls DELETE query", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { deleteSession } = await loadAuth();

    await deleteSession("tok-123");
    const deleteCall = mockQuery.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("DELETE FROM auth_sessions"),
    );
    expect(deleteCall).toBeDefined();
  });
});

// ── getCurrentUser ───────────────────────────────────────────────────

describe("getCurrentUser", () => {
  it("returns user from Auth.js session when available", async () => {
    vi.doMock("@/auth", () => ({
      auth: vi.fn(async () => ({
        user: { id: "u1", email: "a@b.com" },
      })),
    }));

    const { getCurrentUser } = await loadAuth();
    const user = await getCurrentUser();
    expect(user).toEqual({ id: "u1", email: "a@b.com" });
  });

  it("falls back to legacy cookie session", async () => {
    mockCookieGet.mockReturnValue({ value: "valid-token" });
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT u.id, u.email")) {
        return { rows: [{ id: "u1", email: "a@b.com" }] };
      }
      return { rows: [] };
    });

    const { getCurrentUser } = await loadAuth();
    const user = await getCurrentUser();
    expect(user).toEqual({ id: "u1", email: "a@b.com" });
  });

  it("returns null when no session", async () => {
    mockCookieGet.mockReturnValue(undefined);
    const { getCurrentUser } = await loadAuth();
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });
});
