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
  it("inserts a user and returns id + email", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { createUser } = await loadAuth();

    const user = await createUser("a@b.com", "pass");
    expect(user).not.toBeNull();
    expect(user!.email).toBe("a@b.com");
    expect(typeof user!.id).toBe("string");

    // Should have called ensureTables (2 CREATE TABLE) + INSERT
    const insertCall = mockQuery.mock.calls.find(
      (c: string[][]) => typeof c[0] === "string" && c[0].includes("INSERT INTO auth_users"),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([user!.id, "a@b.com", "pass"]);
  });

  it("returns null on duplicate email (query throws)", async () => {
    // First five calls succeed (ensureTables), sixth (INSERT) throws
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // CREATE auth_users
      .mockResolvedValueOnce({ rows: [] }) // CREATE auth_sessions
      .mockResolvedValueOnce({ rows: [] }) // CREATE subscriptions
      .mockResolvedValueOnce({ rows: [] }) // ALTER TABLE add vendor_canonical_id
      .mockResolvedValueOnce({ rows: [] }) // CREATE INDEX idx_subscriptions_vendor
      .mockRejectedValueOnce(new Error("unique_violation"));

    const { createUser } = await loadAuth();
    const user = await createUser("dup@b.com", "pass");
    expect(user).toBeNull();
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
  it("returns user when credentials match", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id, email FROM auth_users")) {
        return { rows: [{ id: "u1", email: "a@b.com" }] };
      }
      return { rows: [] };
    });

    const { verifyUser } = await loadAuth();
    const user = await verifyUser("a@b.com", "pass");
    expect(user).toEqual({ id: "u1", email: "a@b.com" });
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
      (c: string[][]) => typeof c[0] === "string" && c[0].includes("INSERT INTO auth_sessions"),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([token, "u1"]);
  });

  it("still returns a token when pool is unavailable", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { createSession } = await loadAuth();
    const token = await createSession("u1");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });
});

// ── getUserFromToken ─────────────────────────────────────────────────

describe("getUserFromToken", () => {
  it("returns user for valid token", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT u.id, u.email")) {
        return { rows: [{ id: "u1", email: "a@b.com" }] };
      }
      return { rows: [] };
    });

    const { getUserFromToken } = await loadAuth();
    const user = await getUserFromToken("valid-token");
    expect(user).toEqual({ id: "u1", email: "a@b.com" });
  });

  it("returns null for invalid token", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { getUserFromToken } = await loadAuth();
    const user = await getUserFromToken("bad-token");
    expect(user).toBeNull();
  });
});

// ── deleteSession ────────────────────────────────────────────────────

describe("deleteSession", () => {
  it("calls DELETE query", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { deleteSession } = await loadAuth();

    await deleteSession("tok-123");
    const deleteCall = mockQuery.mock.calls.find(
      (c: string[][]) => typeof c[0] === "string" && c[0].includes("DELETE FROM auth_sessions"),
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall![1]).toEqual(["tok-123"]);
  });
});

// ── getCurrentUser ───────────────────────────────────────────────────

describe("getCurrentUser", () => {
  it("returns user when session cookie is present", async () => {
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

  it("returns null when no session cookie", async () => {
    mockCookieGet.mockReturnValue(undefined);
    const { getCurrentUser } = await loadAuth();
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });
});
