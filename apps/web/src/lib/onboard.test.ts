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

  it("throws when DATABASE_URL is not set", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { createJob } = await loadOnboard();

    await expect(createJob("https://sentry.io", "sentry.io")).rejects.toThrow(
      "DATABASE_URL is required",
    );
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

  it("returns pending stages when worker has not claimed the job", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("FROM onboarding_jobs WHERE id")) {
        return {
          rows: [{
            id: "job-1",
            url: "https://sentry.io",
            domain: "sentry.io",
            email: null,
            created_at: new Date().toISOString(),
            product_name: null,
            detected_category: null,
            competitors: null,
            fast_mention_rate: null,
            fast_session_count: null,
            fast_platform_coverage: null,
            fast_competitor_rates: null,
            balanced_mention_rate: null,
            balanced_session_count: null,
            balanced_ai_readiness: null,
            balanced_platform_coverage: null,
            balanced_competitor_rates: null,
            balanced_recommendations: null,
            comprehensive_mention_rate: null,
            comprehensive_session_count: null,
            comprehensive_ai_readiness: null,
            comprehensive_platform_coverage: null,
            comprehensive_competitor_rates: null,
            comprehensive_recommendations: null,
            comprehensive_constraint_coverage: null,
            url_analysis_completed_at: null,
            fast_completed_at: null,
            balanced_completed_at: null,
            comprehensive_completed_at: null,
            worker_claimed_at: null,
            error: null,
          }],
        };
      }
      return { rows: [] };
    });
    const { getJobStatus } = await loadOnboard();

    const result = await getJobStatus("job-1");
    expect(result).not.toBeNull();
    expect(result!.stages.url_analysis.status).toBe("pending");
    expect(result!.stages.fast.status).toBe("pending");
    expect(result!.stages.balanced.status).toBe("pending");
    expect(result!.stages.comprehensive.status).toBe("pending");
    expect(result!.stages.url_analysis.data).toBeNull();
    expect(result!.stages.fast.data).toBeNull();
  });

  it("returns running url_analysis when worker has claimed but not completed", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("FROM onboarding_jobs WHERE id")) {
        return {
          rows: [{
            id: "job-1",
            url: "https://sentry.io",
            domain: "sentry.io",
            email: null,
            created_at: new Date().toISOString(),
            product_name: null,
            detected_category: null,
            competitors: null,
            fast_mention_rate: null,
            fast_session_count: null,
            fast_platform_coverage: null,
            fast_competitor_rates: null,
            balanced_mention_rate: null,
            balanced_session_count: null,
            balanced_ai_readiness: null,
            balanced_platform_coverage: null,
            balanced_competitor_rates: null,
            balanced_recommendations: null,
            comprehensive_mention_rate: null,
            comprehensive_session_count: null,
            comprehensive_ai_readiness: null,
            comprehensive_platform_coverage: null,
            comprehensive_competitor_rates: null,
            comprehensive_recommendations: null,
            comprehensive_constraint_coverage: null,
            url_analysis_completed_at: null,
            fast_completed_at: null,
            balanced_completed_at: null,
            comprehensive_completed_at: null,
            worker_claimed_at: new Date().toISOString(),
            error: null,
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
  });

  it("returns complete url_analysis with data and running fast when url done", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("FROM onboarding_jobs WHERE id")) {
        return {
          rows: [{
            id: "job-1",
            url: "https://sentry.io",
            domain: "sentry.io",
            email: null,
            created_at: new Date().toISOString(),
            product_name: "Sentry",
            detected_category: "error_monitoring",
            competitors: [{ name: "Datadog", domain: "datadog.com" }],
            fast_mention_rate: null,
            fast_session_count: null,
            fast_platform_coverage: null,
            fast_competitor_rates: null,
            balanced_mention_rate: null,
            balanced_session_count: null,
            balanced_ai_readiness: null,
            balanced_platform_coverage: null,
            balanced_competitor_rates: null,
            balanced_recommendations: null,
            comprehensive_mention_rate: null,
            comprehensive_session_count: null,
            comprehensive_ai_readiness: null,
            comprehensive_platform_coverage: null,
            comprehensive_competitor_rates: null,
            comprehensive_recommendations: null,
            comprehensive_constraint_coverage: null,
            url_analysis_completed_at: new Date().toISOString(),
            fast_completed_at: null,
            balanced_completed_at: null,
            comprehensive_completed_at: null,
            worker_claimed_at: new Date().toISOString(),
            error: null,
          }],
        };
      }
      return { rows: [] };
    });
    const { getJobStatus } = await loadOnboard();

    const result = await getJobStatus("job-1");
    expect(result).not.toBeNull();
    expect(result!.stages.url_analysis.status).toBe("complete");
    expect(result!.stages.url_analysis.data).toEqual({
      detected_name: "Sentry",
      category: "error_monitoring",
      competitors: ["Datadog"],
    });
    expect(result!.stages.fast.status).toBe("running");
    expect(result!.stages.balanced.status).toBe("pending");
  });

  it("returns all stages complete with full data shape", async () => {
    const recs = [
      { title: "Improve docs", priority: "P1", impact: "HIGH", description: "Better docs" },
      { title: "Add SDK", priority: "P2", impact: "MEDIUM", description: "Publish SDK" },
    ];
    const constraints = [
      { constraint: "serverless_compatible", addressed_rate: 85 },
      { constraint: "eu_data_residency", addressed_rate: 42 },
    ];

    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("FROM onboarding_jobs WHERE id")) {
        return {
          rows: [{
            id: "job-1",
            url: "https://sentry.io",
            domain: "sentry.io",
            email: "test@test.com",
            created_at: new Date().toISOString(),
            product_name: "Sentry",
            detected_category: "error_monitoring",
            competitors: [{ name: "Datadog", domain: "datadog.com" }],
            fast_mention_rate: 45.2,
            fast_session_count: 150,
            fast_platform_coverage: { claude_code: true, codex_cli: true },
            fast_competitor_rates: null,
            balanced_mention_rate: 42.8,
            balanced_session_count: 350,
            balanced_ai_readiness: 67,
            balanced_platform_coverage: { claude_code: true, codex_cli: true, cursor: true },
            balanced_competitor_rates: [{ name: "Datadog", mentionRate: 38.5, delta: 4.3 }],
            balanced_recommendations: recs,
            comprehensive_mention_rate: 44.1,
            comprehensive_session_count: 800,
            comprehensive_ai_readiness: 72,
            comprehensive_platform_coverage: { claude_code: true, codex_cli: true, cursor: true },
            comprehensive_competitor_rates: [{ name: "Datadog", mentionRate: 39.0, delta: 5.1 }],
            comprehensive_recommendations: recs,
            comprehensive_constraint_coverage: constraints,
            url_analysis_completed_at: new Date().toISOString(),
            fast_completed_at: new Date().toISOString(),
            balanced_completed_at: new Date().toISOString(),
            comprehensive_completed_at: new Date().toISOString(),
            worker_claimed_at: new Date().toISOString(),
            error: null,
          }],
        };
      }
      return { rows: [] };
    });
    const { getJobStatus } = await loadOnboard();

    const result = await getJobStatus("job-1");
    expect(result).not.toBeNull();

    // All stages complete
    expect(result!.stages.url_analysis.status).toBe("complete");
    expect(result!.stages.fast.status).toBe("complete");
    expect(result!.stages.balanced.status).toBe("complete");
    expect(result!.stages.comprehensive.status).toBe("complete");

    // URL analysis data
    expect(result!.stages.url_analysis.data!.detected_name).toBe("Sentry");
    expect(result!.stages.url_analysis.data!.category).toBe("error_monitoring");
    expect(result!.stages.url_analysis.data!.competitors).toEqual(["Datadog"]);

    // Fast data
    expect(result!.stages.fast.data!.sessions_analyzed).toBe(150);
    expect(result!.stages.fast.data!.mention_rate).toBe(45);
    expect(result!.stages.fast.data!.platforms).toEqual(["claude_code", "codex_cli"]);

    // Balanced data
    expect(result!.stages.balanced.data!.ai_readiness_score).toBe(67);
    expect(result!.stages.balanced.data!.competitor_comparison).toHaveLength(1);
    expect(result!.stages.balanced.data!.competitor_comparison[0].name).toBe("Datadog");
    expect(result!.stages.balanced.data!.recommendation_count).toBe(2);

    // Comprehensive data
    expect(result!.stages.comprehensive.data!.ai_readiness_score).toBe(72);
    expect(result!.stages.comprehensive.data!.all_recommendations).toHaveLength(2);
    expect(result!.stages.comprehensive.data!.constraint_coverage).toHaveLength(2);
    expect(result!.stages.comprehensive.data!.constraint_coverage[0].addressed_rate).toBe(85);

    // Email preserved
    expect(result!.email).toBe("test@test.com");
  });
});
