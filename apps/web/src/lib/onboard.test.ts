import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock fns ──────────────────────────────────────────────────

const mockQuery = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
  mockQuery.mockReset();

  vi.doMock("pg", () => {
    return {
      Pool: class MockPool {
        query = mockQuery;
      },
    };
  });
});

async function loadOnboard() {
  return import("./onboard");
}

// ── domainSeed (tested via exported function) ────────────────────────

describe("domainSeed", () => {
  it("returns the same value for the same domain + salt (determinism)", async () => {
    const { domainSeed } = await loadOnboard();
    const a = domainSeed("sentry.io", 1);
    const b = domainSeed("sentry.io", 1);
    expect(a).toBe(b);
  });

  it("returns different values for different salts", async () => {
    const { domainSeed } = await loadOnboard();
    const a = domainSeed("sentry.io", 1);
    const b = domainSeed("sentry.io", 2);
    expect(a).not.toBe(b);
  });

  it("returns different values for different domains", async () => {
    const { domainSeed } = await loadOnboard();
    const a = domainSeed("sentry.io", 1);
    const b = domainSeed("datadog.com", 1);
    expect(a).not.toBe(b);
  });

  it("returns a value between 0 and 1", async () => {
    const { domainSeed } = await loadOnboard();
    const val = domainSeed("example.com", 42);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });
});

// ── stageStatusFromElapsed ───────────────────────────────────────────

describe("stageStatusFromElapsed", () => {
  it("elapsed=0: all pending", async () => {
    const { stageStatusFromElapsed } = await loadOnboard();
    const s = stageStatusFromElapsed(0);
    expect(s).toEqual({
      url_analysis: "pending",
      fast: "pending",
      balanced: "pending",
      comprehensive: "pending",
    });
  });

  it("elapsed=1: url_analysis running, rest pending", async () => {
    const { stageStatusFromElapsed } = await loadOnboard();
    const s = stageStatusFromElapsed(1);
    expect(s).toEqual({
      url_analysis: "running",
      fast: "pending",
      balanced: "pending",
      comprehensive: "pending",
    });
  });

  it("elapsed=16: url_analysis complete, fast running, rest pending", async () => {
    const { stageStatusFromElapsed } = await loadOnboard();
    const s = stageStatusFromElapsed(16);
    expect(s).toEqual({
      url_analysis: "complete",
      fast: "running",
      balanced: "pending",
      comprehensive: "pending",
    });
  });

  it("elapsed=31: url_analysis+fast complete, balanced running, comprehensive pending", async () => {
    const { stageStatusFromElapsed } = await loadOnboard();
    const s = stageStatusFromElapsed(31);
    expect(s).toEqual({
      url_analysis: "complete",
      fast: "complete",
      balanced: "running",
      comprehensive: "pending",
    });
  });

  it("elapsed=121: url_analysis+fast+balanced complete, comprehensive running", async () => {
    const { stageStatusFromElapsed } = await loadOnboard();
    const s = stageStatusFromElapsed(121);
    expect(s).toEqual({
      url_analysis: "complete",
      fast: "complete",
      balanced: "complete",
      comprehensive: "running",
    });
  });

  it("elapsed=301: all complete", async () => {
    const { stageStatusFromElapsed } = await loadOnboard();
    const s = stageStatusFromElapsed(301);
    expect(s).toEqual({
      url_analysis: "complete",
      fast: "complete",
      balanced: "complete",
      comprehensive: "complete",
    });
  });
});

// ── createJob ────────────────────────────────────────────────────────

describe("createJob", () => {
  it("inserts a row and returns a non-empty id", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { createJob } = await loadOnboard();

    const id = await createJob("https://sentry.io", "sentry.io");
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const insertCall = mockQuery.mock.calls.find(
      (c: string[][]) => typeof c[0] === "string" && c[0].includes("INSERT INTO onboarding_jobs"),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([id, "https://sentry.io", "sentry.io"]);
  });
});

// ── findRecentJob ────────────────────────────────────────────────────

describe("findRecentJob", () => {
  it("returns null when no rows", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { findRecentJob } = await loadOnboard();

    const result = await findRecentJob("sentry.io");
    expect(result).toBeNull();
  });

  it("returns the id when a recent row exists", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id FROM onboarding_jobs")) {
        return { rows: [{ id: "existing-job-id" }] };
      }
      return { rows: [] };
    });
    const { findRecentJob } = await loadOnboard();

    const result = await findRecentJob("sentry.io");
    expect(result).toBe("existing-job-id");
  });

  it("SQL contains INTERVAL '24 hours'", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { findRecentJob } = await loadOnboard();

    await findRecentJob("sentry.io");
    const call = mockQuery.mock.calls.find(
      (c: string[][]) => typeof c[0] === "string" && c[0].includes("INTERVAL '24 hours'"),
    );
    expect(call).toBeDefined();
  });
});

// ── getJob ───────────────────────────────────────────────────────────

describe("getJob", () => {
  it("returns null when no rows", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { getJob } = await loadOnboard();

    const result = await getJob("nonexistent");
    expect(result).toBeNull();
  });

  it("maps DB row to OnboardingJob shape", async () => {
    const now = new Date();
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id, url, domain, email, created_at")) {
        return {
          rows: [{
            id: "job-1",
            url: "https://sentry.io",
            domain: "sentry.io",
            email: "test@test.com",
            created_at: now.toISOString(),
          }],
        };
      }
      return { rows: [] };
    });
    const { getJob } = await loadOnboard();

    const result = await getJob("job-1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("job-1");
    expect(result!.url).toBe("https://sentry.io");
    expect(result!.domain).toBe("sentry.io");
    expect(result!.email).toBe("test@test.com");
    expect(result!.created_at).toBeInstanceOf(Date);
  });
});

// ── saveJobEmail ─────────────────────────────────────────────────────

describe("saveJobEmail", () => {
  it("issues an UPDATE with correct email and jobId", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { saveJobEmail } = await loadOnboard();

    await saveJobEmail("job-1", "user@test.com");
    const updateCall = mockQuery.mock.calls.find(
      (c: string[][]) => typeof c[0] === "string" && c[0].includes("UPDATE onboarding_jobs"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual(["user@test.com", "job-1"]);
  });
});

// ── getJobStatus ─────────────────────────────────────────────────────

describe("getJobStatus", () => {
  it("returns null when job not found", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { getJobStatus } = await loadOnboard();

    const result = await getJobStatus("nonexistent");
    expect(result).toBeNull();
  });

  it("when elapsed is 0s: stages are pending/running with no data", async () => {
    const now = new Date(Date.now() - 2_000); // 2s ago so elapsed > 0 reliably
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id, url, domain, email, created_at")) {
        return {
          rows: [{
            id: "job-1",
            url: "https://example.com",
            domain: "example.com",
            email: null,
            created_at: now.toISOString(),
          }],
        };
      }
      return { rows: [] };
    });
    const { getJobStatus } = await loadOnboard();

    const result = await getJobStatus("job-1");
    expect(result).not.toBeNull();
    expect(result!.stages.url_analysis.status).toBe("running");
    expect(result!.stages.fast.status).toBe("pending");
    expect(result!.stages.fast.data).toBeNull();
    expect(result!.stages.balanced.data).toBeNull();
  });

  it("when elapsed > 30s: url_analysis and fast have data", async () => {
    const past = new Date(Date.now() - 35_000);
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id, url, domain, email, created_at")) {
        return {
          rows: [{
            id: "job-1",
            url: "https://sentry.io",
            domain: "sentry.io",
            email: null,
            created_at: past.toISOString(),
          }],
        };
      }
      return { rows: [] };
    });
    const { getJobStatus } = await loadOnboard();

    const result = await getJobStatus("job-1");
    expect(result).not.toBeNull();
    expect(result!.stages.url_analysis.status).toBe("complete");
    expect(result!.stages.url_analysis.data).not.toBeNull();
    expect(result!.stages.fast.status).toBe("complete");
    expect(result!.stages.fast.data).not.toBeNull();
    expect(result!.stages.fast.data!.mention_rate).toBeGreaterThan(0);
  });

  it("when elapsed > 120s: balanced has complete data with valid shape", async () => {
    const past = new Date(Date.now() - 125_000);
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id, url, domain, email, created_at")) {
        return {
          rows: [{
            id: "job-1",
            url: "https://sentry.io",
            domain: "sentry.io",
            email: null,
            created_at: past.toISOString(),
          }],
        };
      }
      return { rows: [] };
    });
    const { getJobStatus } = await loadOnboard();

    const result = await getJobStatus("job-1");
    expect(result).not.toBeNull();
    expect(result!.stages.balanced.status).toBe("complete");
    const balanced = result!.stages.balanced.data;
    expect(balanced).not.toBeNull();
    expect(Array.isArray(balanced!.competitor_comparison)).toBe(true);
    expect(balanced!.recommendation_count).toBeGreaterThan(0);
    expect(balanced!.top_recommendation).toHaveProperty("priority");
    expect(balanced!.top_recommendation).toHaveProperty("impact");
    expect(["P1", "P2", "P3"]).toContain(balanced!.top_recommendation.priority);
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(balanced!.top_recommendation.impact);
  });

  it("comprehensive.data has valid shape when elapsed > 300s", async () => {
    const past = new Date(Date.now() - 400_000);
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id, url, domain, email, created_at")) {
        return {
          rows: [{
            id: "job-1",
            url: "https://sentry.io",
            domain: "sentry.io",
            email: null,
            created_at: past.toISOString(),
          }],
        };
      }
      return { rows: [] };
    });
    const { getJobStatus } = await loadOnboard();

    const result = await getJobStatus("job-1");
    expect(result).not.toBeNull();
    expect(result!.stages.comprehensive.status).toBe("complete");
    const comp = result!.stages.comprehensive.data;
    expect(comp).not.toBeNull();
    expect(comp!.sessions_analyzed).toBeGreaterThan(0);
    expect(comp!.mention_rate).toBeGreaterThanOrEqual(0);
    expect(comp!.platforms).toContain("Claude Code");
    expect(comp!.platforms).toContain("Codex CLI");
    expect(comp!.platforms).toContain("Cursor");
    expect(comp!.ai_readiness_score).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(comp!.competitor_comparison)).toBe(true);
    expect(Array.isArray(comp!.all_recommendations)).toBe(true);
    expect(comp!.all_recommendations.length).toBeGreaterThan(0);
    expect(comp!.recommendation_count).toBe(comp!.all_recommendations.length);
    expect(comp!.top_recommendation).toHaveProperty("priority");
    expect(comp!.top_recommendation).toHaveProperty("impact");
    expect(Array.isArray(comp!.constraint_coverage)).toBe(true);
    expect(comp!.constraint_coverage.length).toBeGreaterThan(0);
    for (const cc of comp!.constraint_coverage) {
      expect(cc).toHaveProperty("constraint");
      expect(cc.addressed_rate).toBeGreaterThanOrEqual(0);
      expect(cc.addressed_rate).toBeLessThanOrEqual(100);
    }
  });

  it("mock data is deterministic: two calls return identical data", async () => {
    const past = new Date(Date.now() - 200_000);
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id, url, domain, email, created_at")) {
        return {
          rows: [{
            id: "job-1",
            url: "https://sentry.io",
            domain: "sentry.io",
            email: null,
            created_at: past.toISOString(),
          }],
        };
      }
      return { rows: [] };
    });
    const { getJobStatus } = await loadOnboard();

    const result1 = await getJobStatus("job-1");
    const result2 = await getJobStatus("job-1");
    expect(result1!.stages.balanced.data).toEqual(result2!.stages.balanced.data);
    expect(result1!.stages.fast.data).toEqual(result2!.stages.fast.data);
    expect(result1!.stages.url_analysis.data).toEqual(result2!.stages.url_analysis.data);
  });
});
