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
  _resetForTesting,
  getRejectionSummary,
  getRejectionDetails,
  getRejectionReasonBreakdown,
  getAlternativeFlows,
} from "./db";

// ── Helpers ────────────────────────────────────────────────────────────

function hasTableRow(name: string) {
  return { table_name: name };
}

// ── Setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  mockQuery.mockReset();
  _resetForTesting();
});

// ── getRejectionSummary ────────────────────────────────────────────────

describe("getRejectionSummary", () => {
  it("returns empty array when vendor_rejections table doesn't exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // hasTable → false

    const result = await getRejectionSummary();
    expect(result).toEqual([]);
  });

  it("returns rejection summaries with computed rejection_rate", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          vendor_canonical_id: "planetscale",
          total_rejections: "28",
          too_expensive: "15",
          too_complex: "3",
          poor_docs: "2",
          not_available_region: "1",
          feature_gap: "5",
          trust_concerns: "0",
          vendor_lock_in: "2",
          top_alternative: "supabase",
          total_mentions: "34",
        },
      ],
    });

    const result = await getRejectionSummary();

    expect(result).toHaveLength(1);
    expect(result[0].vendor_canonical_id).toBe("planetscale");
    expect(result[0].total_rejections).toBe(28);
    expect(result[0].too_expensive).toBe(15);
    expect(result[0].too_complex).toBe(3);
    expect(result[0].poor_docs).toBe(2);
    expect(result[0].not_available_region).toBe(1);
    expect(result[0].feature_gap).toBe(5);
    expect(result[0].trust_concerns).toBe(0);
    expect(result[0].vendor_lock_in).toBe(2);
    expect(result[0].top_alternative).toBe("supabase");
    expect(result[0].total_mentions).toBe(34);
    expect(result[0].rejection_rate).toBeCloseTo(28 / 34);
  });

  it("handles zero mentions gracefully (rejection_rate = 0)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          vendor_canonical_id: "test-vendor",
          total_rejections: "5",
          too_expensive: "5",
          too_complex: "0",
          poor_docs: "0",
          not_available_region: "0",
          feature_gap: "0",
          trust_concerns: "0",
          vendor_lock_in: "0",
          top_alternative: null,
          total_mentions: "0",
        },
      ],
    });

    const result = await getRejectionSummary();
    expect(result[0].rejection_rate).toBe(0);
    expect(result[0].top_alternative).toBeNull();
  });

  it("scopes by vendorScope when provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getRejectionSummary("planetscale");

    // The second call should be the main query with vendor filter
    const mainCall = mockQuery.mock.calls[1];
    expect(mainCall[0]).toContain("vr.vendor_canonical_id = $1");
    expect(mainCall[1]).toEqual(["planetscale"]);
  });

  it("returns empty array on query error", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockRejectedValueOnce(new Error("connection lost"));

    const result = await getRejectionSummary();
    expect(result).toEqual([]);
  });
});

// ── getRejectionDetails ────────────────────────────────────────────────

describe("getRejectionDetails", () => {
  it("returns empty array when table doesn't exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // hasTable → false

    const result = await getRejectionDetails();
    expect(result).toEqual([]);
  });

  it("returns rejection details with source platform", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          session_id: "sess-1",
          vendor_canonical_id: "planetscale",
          rejection_reason: "too_expensive",
          rejection_reason_detail: "Pricing is steep for hobby projects",
          chosen_alternative: "supabase",
          timestamp: "2026-01-15T12:00:00Z",
          source_platform: "claude_code",
        },
      ],
    });

    const result = await getRejectionDetails();

    expect(result).toHaveLength(1);
    expect(result[0].vendor_canonical_id).toBe("planetscale");
    expect(result[0].rejection_reason).toBe("too_expensive");
    expect(result[0].rejection_reason_detail).toBe("Pricing is steep for hobby projects");
    expect(result[0].chosen_alternative).toBe("supabase");
    expect(result[0].source_platform).toBe("claude_code");
  });

  it("filters by vendorId when provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getRejectionDetails("firebase", 50);

    const mainCall = mockQuery.mock.calls[1];
    expect(mainCall[0]).toContain("vr.vendor_canonical_id = $1");
    expect(mainCall[1]).toEqual(["firebase", 50]);
  });

  it("uses default limit of 100", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getRejectionDetails();

    const mainCall = mockQuery.mock.calls[1];
    expect(mainCall[1]).toEqual([100]);
  });

  it("handles null fields gracefully", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 2,
          session_id: "sess-2",
          vendor_canonical_id: "neon",
          rejection_reason: "feature_gap",
          rejection_reason_detail: null,
          chosen_alternative: null,
          timestamp: "2026-01-16T12:00:00Z",
          source_platform: null,
        },
      ],
    });

    const result = await getRejectionDetails();
    expect(result[0].rejection_reason_detail).toBeNull();
    expect(result[0].chosen_alternative).toBeNull();
    expect(result[0].source_platform).toBeNull();
  });
});

// ── getRejectionReasonBreakdown ────────────────────────────────────────

describe("getRejectionReasonBreakdown", () => {
  it("returns empty array when table doesn't exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // hasTable → false

    const result = await getRejectionReasonBreakdown();
    expect(result).toEqual([]);
  });

  it("computes percentage for each reason", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { rejection_reason: "too_expensive", count: "30" },
        { rejection_reason: "feature_gap", count: "15" },
        { rejection_reason: "vendor_lock_in", count: "5" },
      ],
    });

    const result = await getRejectionReasonBreakdown();

    expect(result).toHaveLength(3);
    expect(result[0].reason).toBe("too_expensive");
    expect(result[0].count).toBe(30);
    expect(result[0].percentage).toBeCloseTo(30 / 50);

    expect(result[1].reason).toBe("feature_gap");
    expect(result[1].count).toBe(15);
    expect(result[1].percentage).toBeCloseTo(15 / 50);

    expect(result[2].reason).toBe("vendor_lock_in");
    expect(result[2].count).toBe(5);
    expect(result[2].percentage).toBeCloseTo(5 / 50);
  });

  it("filters by vendorId when provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getRejectionReasonBreakdown("planetscale");

    const mainCall = mockQuery.mock.calls[1];
    expect(mainCall[0]).toContain("vendor_canonical_id = $1");
    expect(mainCall[1]).toEqual(["planetscale"]);
  });
});

// ── getAlternativeFlows ────────────────────────────────────────────────

describe("getAlternativeFlows", () => {
  it("returns empty array when table doesn't exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // hasTable → false

    const result = await getAlternativeFlows();
    expect(result).toEqual([]);
  });

  it("returns alternative flow data", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { rejected_vendor: "planetscale", chosen_alternative: "supabase", count: "12" },
        { rejected_vendor: "firebase", chosen_alternative: "supabase", count: "8" },
        { rejected_vendor: "planetscale", chosen_alternative: "neon", count: "5" },
      ],
    });

    const result = await getAlternativeFlows();

    expect(result).toHaveLength(3);
    expect(result[0].rejected_vendor).toBe("planetscale");
    expect(result[0].chosen_alternative).toBe("supabase");
    expect(result[0].count).toBe(12);
    expect(result[1].rejected_vendor).toBe("firebase");
    expect(result[1].count).toBe(8);
  });

  it("scopes by vendorScope when provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getAlternativeFlows("planetscale");

    const mainCall = mockQuery.mock.calls[1];
    expect(mainCall[0]).toContain("vendor_canonical_id = $1 OR chosen_alternative = $1");
    expect(mainCall[1]).toEqual(["planetscale"]);
  });

  it("returns empty array on query error", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockRejectedValueOnce(new Error("connection lost"));

    const result = await getAlternativeFlows();
    expect(result).toEqual([]);
  });
});

// ── hasTable caching for rejections ────────────────────────────────────

describe("hasTable caching for rejections", () => {
  it("caches vendor_rejections table check across calls", async () => {
    // First call: hasTable("vendor_rejections") → true
    mockQuery.mockResolvedValueOnce({ rows: [hasTableRow("vendor_rejections")] });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // main query

    await getRejectionSummary();
    expect(mockQuery).toHaveBeenCalledTimes(2);

    mockQuery.mockClear();

    // Second call: hasTable should be cached
    mockQuery.mockResolvedValueOnce({ rows: [] }); // just the main query

    await getRejectionReasonBreakdown();

    // Only the main query, not hasTable again
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
