import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock pg ────────────────────────────────────────────────────────────

const mockQuery = vi.fn();

vi.mock("pg", () => ({
  Pool: class MockPool {
    query = mockQuery;
  },
}));

// Set DATABASE_URL so getPool() succeeds
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

// Import AFTER mocks are in place
import {
  safeJsonParse,
  _resetForTesting,
  getAllVendorScorecards,
  getAllVendorNames,
  getAllVendorTrends,
  getPromptPageData,
} from "./db";

// ── Helpers ────────────────────────────────────────────────────────────

function hasTableRow(name: string) {
  return { table_name: name };
}

/** Build a minimal response_context row joined with session+prompt_metadata */
function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    session_id: "sess-1",
    prompt_id: "prompt-1",
    primary_vendor: null as string | null,
    is_implemented: false,
    rationale_snippet: null,
    vendors_mentioned: "[]",
    trade_offs_snippet: null,
    gotchas_snippet: null,
    constraints_addressed: "[]",
    extracted_at: "2025-01-15T00:00:00Z",
    source_platform: "claude_code",
    category: "database",
    constraints: "[]",
    reasoning_chain: null,
    disqualification_reasons: null,
    confidence_score: null,
    started_at: "2025-01-15T00:00:00Z",
    ...overrides,
  };
}

/** Build a minimal prompt_metadata row */
function makePromptMeta(overrides: Record<string, unknown> = {}) {
  return {
    prompt_id: "prompt-1",
    category: "database",
    content_tags: "[]",
    pattern_tags: "[]",
    constraints: "[]",
    existing_stack: "[]",
    failure_mode: null,
    vendors_named_in_prompt: "[]",
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  mockQuery.mockReset();
  _resetForTesting();
});

// ── safeJsonParse ──────────────────────────────────────────────────────

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('["a","b"]', [])).toEqual(["a", "b"]);
  });

  it("returns fallback for invalid JSON", () => {
    expect(safeJsonParse("not-json", [])).toEqual([]);
  });

  it("returns fallback for null/undefined", () => {
    expect(safeJsonParse(null, "default")).toBe("default");
    expect(safeJsonParse(undefined, "default")).toBe("default");
  });
});

// ── getAllVendorScorecards ──────────────────────────────────────────────

describe("getAllVendorScorecards", () => {
  it("returns empty array when tables don't exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // hasTable("response_context") → false

    const result = await getAllVendorScorecards();
    expect(result).toEqual([]);
  });

  it("builds scorecards from response data", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("response_context")] });
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("prompt_metadata")] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeResponse({
          id: 1,
          session_id: "s1",
          prompt_id: "p1",
          primary_vendor: "supabase",
          is_implemented: true,
          vendors_mentioned: JSON.stringify([
            { vendor: "supabase", disposition: "recommended" },
            { vendor: "planetscale", disposition: "compared" },
          ]),
          constraints_addressed: JSON.stringify(["serverless_compatible"]),
          constraints: JSON.stringify(["serverless_compatible", "type_safe"]),
          category: "database",
          source_platform: "claude_code",
        }),
        makeResponse({
          id: 2,
          session_id: "s2",
          prompt_id: "p2",
          primary_vendor: "planetscale",
          is_implemented: false,
          vendors_mentioned: JSON.stringify([
            { vendor: "planetscale", disposition: "recommended" },
            { vendor: "supabase", disposition: "rejected" },
          ]),
          constraints_addressed: JSON.stringify(["type_safe"]),
          constraints: JSON.stringify(["type_safe"]),
          category: "database",
          source_platform: "codex_cli",
        }),
      ],
    });

    const scorecards = await getAllVendorScorecards();

    expect(scorecards.length).toBe(2);

    const supabase = scorecards.find((s) => s.vendor === "supabase");
    const planetscale = scorecards.find((s) => s.vendor === "planetscale");

    expect(supabase).toBeDefined();
    expect(planetscale).toBeDefined();

    // Supabase: primary in p1, rejected in p2 → mentioned in 2
    expect(supabase!.totalRecommendations).toBe(1);
    expect(supabase!.totalMentions).toBe(2);
    expect(supabase!.winRate).toBe(0.5);
    expect(supabase!.implementationRate).toBe(1); // 1/1

    // PlanetScale: compared in p1, primary in p2 → mentioned in 2
    expect(planetscale!.totalRecommendations).toBe(1);
    expect(planetscale!.totalMentions).toBe(2);
    expect(planetscale!.implementationRate).toBe(0); // 0/1

    // Supabase competitor wins
    expect(supabase!.competitorWins.length).toBe(1);
    expect(supabase!.competitorWins[0].competitor).toBe("planetscale");

    // Platform split
    expect(supabase!.platformSplit).toEqual({ claude_code: 1 });
    expect(planetscale!.platformSplit).toEqual({ codex_cli: 1 });

    // Constraints
    expect(supabase!.constraintsAddressed).toEqual([
      { constraint: "serverless_compatible", count: 1 },
    ]);
  });

  it("handles empty response data", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("response_context")] });
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("prompt_metadata")] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const scorecards = await getAllVendorScorecards();
    expect(scorecards).toEqual([]);
  });
});

// ── getAllVendorNames ───────────────────────────────────────────────────

describe("getAllVendorNames", () => {
  it("aggregates vendor stats from response data", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("response_context")] });
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("prompt_metadata")] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeResponse({
          primary_vendor: "supabase",
          is_implemented: true,
          vendors_mentioned: JSON.stringify([
            { vendor: "supabase", disposition: "recommended" },
          ]),
          category: "database",
          source_platform: "claude_code",
        }),
        makeResponse({
          primary_vendor: "supabase",
          is_implemented: false,
          vendors_mentioned: JSON.stringify([
            { vendor: "supabase", disposition: "recommended" },
            { vendor: "neon", disposition: "compared" },
          ]),
          category: "database",
          source_platform: "codex_cli",
        }),
      ],
    });

    const result = await getAllVendorNames();

    const supabase = result.find((v) => v.vendor === "supabase");
    expect(supabase).toBeDefined();
    expect(supabase!.totalRecommendations).toBe(2);
    expect(supabase!.totalMentions).toBe(2);
    expect(supabase!.implementationRate).toBe(0.5);
    expect(supabase!.platforms).toContain("claude_code");
    expect(supabase!.platforms).toContain("codex_cli");

    const neon = result.find((v) => v.vendor === "neon");
    expect(neon).toBeDefined();
    expect(neon!.totalRecommendations).toBe(0);
    expect(neon!.totalMentions).toBe(1);
  });
});

// ── getAllVendorTrends ──────────────────────────────────────────────────

describe("getAllVendorTrends", () => {
  it("computes trends from a single query (no N+1)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("response_context")] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          primary_vendor: "supabase",
          vendors_mentioned: JSON.stringify([
            { vendor: "supabase", disposition: "recommended" },
          ]),
          extracted_at: "2025-01-06T00:00:00Z",
          started_at: "2025-01-06T00:00:00Z",
        },
        {
          primary_vendor: "supabase",
          vendors_mentioned: JSON.stringify([
            { vendor: "supabase", disposition: "recommended" },
          ]),
          extracted_at: "2025-01-13T00:00:00Z",
          started_at: "2025-01-13T00:00:00Z",
        },
        {
          primary_vendor: "planetscale",
          vendors_mentioned: JSON.stringify([
            { vendor: "planetscale", disposition: "recommended" },
            { vendor: "supabase", disposition: "compared" },
          ]),
          extracted_at: "2025-01-14T00:00:00Z",
          started_at: "2025-01-14T00:00:00Z",
        },
      ],
    });

    const trends = await getAllVendorTrends();

    // Only 2 queries: hasTable + main. NOT N queries per vendor.
    expect(mockQuery).toHaveBeenCalledTimes(2);

    const supabaseTrend = trends.find((t) => t.vendor === "supabase");
    expect(supabaseTrend).toBeDefined();
    expect(supabaseTrend!.dataPoints.length).toBeGreaterThanOrEqual(1);

    const planetscaleTrend = trends.find((t) => t.vendor === "planetscale");
    expect(planetscaleTrend).toBeDefined();
  });

  it("returns empty when table doesn't exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // hasTable → false

    const trends = await getAllVendorTrends();
    expect(trends).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

// ── getPromptPageData ──────────────────────────────────────────────────

describe("getPromptPageData", () => {
  it("returns both leaderboard and constraintDemand from shared data", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("response_context")] });
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("prompt_metadata")] });
    // Promise.all fires both queries concurrently; mock resolves in call order
    mockQuery.mockResolvedValueOnce({
      rows: [
        makePromptMeta({
          prompt_id: "p1",
          category: "database",
          constraints: JSON.stringify(["serverless_compatible", "type_safe"]),
        }),
        makePromptMeta({
          prompt_id: "p2",
          category: "ci_cd",
          constraints: JSON.stringify(["serverless_compatible"]),
        }),
      ],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          session_id: "s1",
          prompt_id: "p1",
          primary_vendor: "supabase",
          is_implemented: true,
          vendors_mentioned: JSON.stringify([{ vendor: "supabase", disposition: "recommended" }]),
          constraints_addressed: JSON.stringify(["serverless_compatible"]),
          extracted_at: "2025-01-15",
        },
        {
          id: 2,
          session_id: "s2",
          prompt_id: "p1",
          primary_vendor: "neon",
          is_implemented: false,
          vendors_mentioned: JSON.stringify([{ vendor: "neon", disposition: "recommended" }]),
          constraints_addressed: JSON.stringify(["serverless_compatible", "type_safe"]),
          extracted_at: "2025-01-16",
        },
        {
          id: 3,
          session_id: "s3",
          prompt_id: "p2",
          primary_vendor: "supabase",
          is_implemented: true,
          vendors_mentioned: JSON.stringify([{ vendor: "supabase", disposition: "recommended" }]),
          constraints_addressed: JSON.stringify(["serverless_compatible"]),
          extracted_at: "2025-01-17",
        },
      ],
    });

    const { leaderboard, constraintDemand } = await getPromptPageData();

    // ── Leaderboard checks ──
    expect(leaderboard.length).toBe(2);

    const p1 = leaderboard.find((p) => p.prompt_id === "p1");
    expect(p1).toBeDefined();
    expect(p1!.response_count).toBe(2);
    expect(p1!.unique_vendors).toBe(2);
    expect(p1!.implementation_rate).toBe(0.5);
    expect(p1!.is_contested).toBe(true); // 50%, no single vendor > 50%
    expect(p1!.is_dominated).toBe(false);

    const p2 = leaderboard.find((p) => p.prompt_id === "p2");
    expect(p2).toBeDefined();
    expect(p2!.response_count).toBe(1);
    expect(p2!.top_vendor).toBe("supabase");
    expect(p2!.is_contested).toBe(false); // only 1 response

    // ── Constraint demand checks ──
    const serverless = constraintDemand.find((c) => c.constraint === "serverless_compatible");
    expect(serverless).toBeDefined();
    expect(serverless!.prompt_count).toBe(2); // in p1 and p2
    expect(serverless!.response_count).toBe(3); // p1 has 2 responses + p2 has 1
    expect(serverless!.coverage_rate).toBeCloseTo(1.0); // all 3 address it

    const typeSafe = constraintDemand.find((c) => c.constraint === "type_safe");
    expect(typeSafe).toBeDefined();
    expect(typeSafe!.prompt_count).toBe(1); // only p1
    expect(typeSafe!.response_count).toBe(2); // p1 has 2 responses
    expect(typeSafe!.coverage_rate).toBeCloseTo(0.5); // only neon addresses it
    expect(typeSafe!.top_vendor).toBe("neon");
  });

  it("returns empty results when tables don't exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // hasTable → false

    const { leaderboard, constraintDemand } = await getPromptPageData();
    expect(leaderboard).toEqual([]);
    expect(constraintDemand).toEqual([]);
  });

  it("skips prompts with zero responses", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("response_context")] });
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("prompt_metadata")] });
    mockQuery.mockResolvedValueOnce({
      rows: [makePromptMeta({ prompt_id: "orphan", category: "database" })],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { leaderboard } = await getPromptPageData();
    expect(leaderboard).toEqual([]);
  });
});

// ── hasTable caching ───────────────────────────────────────────────────

describe("hasTable caching", () => {
  it("caches table existence across calls to avoid redundant queries", async () => {
    // First call: hasTable("response_context") queries the mock → returns true
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("response_context")] });
    // Main query returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getAllVendorTrends();
    expect(mockQuery).toHaveBeenCalledTimes(2); // hasTable + main query

    mockQuery.mockClear();

    // Second call: hasTable("response_context") should be cached
    mockQuery.mockResolvedValueOnce({ rows: [] }); // just the main query

    await getAllVendorTrends();

    // Should have only called the main query, NOT hasTable again
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
