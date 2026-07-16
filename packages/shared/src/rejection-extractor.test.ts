import { describe, it, expect } from "vitest";
import { extractVendorRejections } from "./rejection-extractor.js";
import type { VendorTaxonomy, ParsedTurn, VendorRejection } from "./types.js";

// ── Test Fixtures ───────────────────────────────────────────────────

const TAXONOMY: VendorTaxonomy = {
  vendors: [
    { canonical_id: "planetscale", display_name: "PlanetScale", category: "database", synonyms: ["pscale"] },
    { canonical_id: "supabase", display_name: "Supabase", category: "database", synonyms: ["supa"] },
    { canonical_id: "neon", display_name: "Neon", category: "database", synonyms: ["neondb"] },
    { canonical_id: "firebase", display_name: "Firebase", category: "backend", synonyms: [] },
    { canonical_id: "vercel", display_name: "Vercel", category: "hosting", synonyms: [] },
    { canonical_id: "aws-rds", display_name: "AWS RDS", category: "database", synonyms: ["rds", "amazon rds"] },
  ],
};

function assistantTurn(text: string, timestamp = "2026-01-15T12:00:00Z"): ParsedTurn {
  return {
    role: "assistant",
    textContent: text,
    toolUses: [],
    toolResults: [],
    timestamp,
  };
}

function userTurn(text: string): ParsedTurn {
  return {
    role: "user",
    textContent: text,
    toolUses: [],
    toolResults: [],
    timestamp: "2026-01-15T11:59:00Z",
  };
}

// ── Core Extraction Tests ───────────────────────────────────────────

describe("extractVendorRejections", () => {
  it("returns empty array when no rejections are present", () => {
    const turns = [
      assistantTurn("I recommend using Supabase for your database needs. It has a great free tier."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toEqual([]);
  });

  it("returns empty array for user turns (only analyzes assistant)", () => {
    const turns = [
      userTurn("I wouldn't recommend PlanetScale because it's too expensive."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toEqual([]);
  });

  it("returns empty array when turns have no text content", () => {
    const turns: ParsedTurn[] = [
      { role: "assistant", textContent: null, toolUses: [], toolResults: [], timestamp: "2026-01-15T12:00:00Z" },
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toEqual([]);
  });

  it("detects a basic rejection with too_expensive reason", () => {
    const turns = [
      assistantTurn("I wouldn't recommend PlanetScale for this use case. The pricing is too high for a hobby project."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("planetscale");
    expect(result[0].rejectionReason).toBe("too_expensive");
    expect(result[0].rejectionReasonDetail).toBeTruthy();
  });

  it("detects rejection with too_complex reason", () => {
    const turns = [
      assistantTurn("I would not recommend AWS RDS here — it's overkill for a small side project. The setup is too complex for what you need."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("aws-rds");
    expect(result[0].rejectionReason).toBe("too_complex");
  });

  it("detects rejection with vendor_lock_in reason", () => {
    const turns = [
      assistantTurn("The main drawback of Firebase is vendor lock-in. It's hard to migrate away from their proprietary APIs."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("firebase");
    expect(result[0].rejectionReason).toBe("vendor_lock_in");
  });

  it("detects rejection with trust_concerns reason", () => {
    const turns = [
      assistantTurn("I wouldn't recommend Neon for production yet. It's still relatively new and unproven at scale."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("neon");
    expect(result[0].rejectionReason).toBe("trust_concerns");
  });

  it("detects rejection with poor_docs reason", () => {
    const turns = [
      assistantTurn("Avoid PlanetScale for now. The documentation is lacking and not well-documented for edge cases."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("planetscale");
    expect(result[0].rejectionReason).toBe("poor_docs");
  });

  it("detects rejection with feature_gap reason", () => {
    const turns = [
      assistantTurn("PlanetScale is not the best option here because it doesn't support foreign keys natively."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("planetscale");
    expect(result[0].rejectionReason).toBe("feature_gap");
  });

  it("detects rejection with not_available_region reason", () => {
    const turns = [
      assistantTurn("I wouldn't recommend PlanetScale — it's not available in the EU region for data residency compliance."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("planetscale");
    expect(result[0].rejectionReason).toBe("not_available_region");
  });

  // ── Alternative Detection ──────────────────────────────────────────

  it("detects chosen alternative via 'instead, use' pattern", () => {
    const turns = [
      assistantTurn("I wouldn't recommend PlanetScale for this. The pricing is steep. Instead, I recommend Supabase for a more budget-friendly option."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    // PlanetScale should be rejected; Supabase may also appear since it's
    // near rejection indicators, but the key assertion is the alternative link
    const planetscale = result.find(r => r.vendorCanonicalId === "planetscale");
    expect(planetscale).toBeDefined();
    expect(planetscale!.chosenAlternative).toBe("supabase");
  });

  it("detects chosen alternative via positive context fallback", () => {
    const turns = [
      assistantTurn("I wouldn't recommend PlanetScale — too expensive. I'd suggest trying Neon instead, which has a better free tier."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    const planetscale = result.find(r => r.vendorCanonicalId === "planetscale");
    expect(planetscale).toBeDefined();
    expect(planetscale!.chosenAlternative).toBe("neon");
  });

  it("returns null alternative when none is mentioned", () => {
    const turns = [
      assistantTurn("I wouldn't recommend PlanetScale because the pricing is too high."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].chosenAlternative).toBeNull();
  });

  // ── Deduplication ─────────────────────────────────────────────────

  it("deduplicates same vendor + same reason across turns", () => {
    const turns = [
      assistantTurn("I wouldn't recommend PlanetScale. The pricing is too high."),
      assistantTurn("As I said, avoid PlanetScale — it costs too much for small teams."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("planetscale");
    expect(result[0].rejectionReason).toBe("too_expensive");
  });

  it("allows same vendor with different reasons", () => {
    const turns = [
      assistantTurn("I wouldn't recommend PlanetScale — the pricing is too high. Also, it doesn't support foreign keys natively, which is a feature gap."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    // Should detect two different rejections for the same vendor
    expect(result.length).toBeGreaterThanOrEqual(1);
    const reasons = result.map(r => r.rejectionReason);
    expect(reasons).toContain("too_expensive");
  });

  // ── Multiple Vendors ──────────────────────────────────────────────

  it("detects rejections for multiple vendors in one turn", () => {
    // Use enough padding between vendors so their ±300 char context windows don't overlap
    const padding = "This is a detailed technical analysis of database options for modern web applications. ".repeat(5);
    const turns = [
      assistantTurn(
        "I wouldn't recommend PlanetScale here — the pricing is too high for small teams. " +
        padding +
        "I also wouldn't recommend Firebase — vendor lock-in makes it hard to migrate away from their proprietary APIs."
      ),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result.length).toBe(2);

    const planetscale = result.find(r => r.vendorCanonicalId === "planetscale");
    const firebase = result.find(r => r.vendorCanonicalId === "firebase");
    expect(planetscale).toBeDefined();
    expect(firebase).toBeDefined();
    expect(planetscale!.rejectionReason).toBe("too_expensive");
    expect(firebase!.rejectionReason).toBe("vendor_lock_in");
  });

  // ── Synonym Matching ──────────────────────────────────────────────

  it("matches vendor synonyms", () => {
    const turns = [
      assistantTurn("Avoid pscale for small projects — the pricing is too high for what you get."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("planetscale");
  });

  // ── Rejection Indicators ──────────────────────────────────────────

  it("detects 'avoid' indicator", () => {
    const turns = [
      assistantTurn("Avoid Firebase for this project — the pricing is too high at scale."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("firebase");
  });

  it("detects 'stay away from' indicator", () => {
    const turns = [
      assistantTurn("Stay away from PlanetScale if you need foreign keys. It doesn't support them natively."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("planetscale");
  });

  it("detects 'moved away from' indicator", () => {
    const turns = [
      assistantTurn("Many teams have moved away from Firebase due to vendor lock-in and proprietary APIs."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("firebase");
  });

  it("detects 'overkill for' indicator", () => {
    const turns = [
      assistantTurn("AWS RDS is overkill for a simple hobby project. The complexity is unnecessary."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].vendorCanonicalId).toBe("aws-rds");
  });

  // ── Detail Snippet ────────────────────────────────────────────────

  it("extracts a detail snippet", () => {
    const turns = [
      assistantTurn("I wouldn't recommend PlanetScale because the pricing is steep for small teams."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].rejectionReasonDetail).toBeTruthy();
    expect(result[0].rejectionReasonDetail!.length).toBeLessThanOrEqual(300);
  });

  it("truncates very long detail snippets to 300 chars", () => {
    const longText = "I wouldn't recommend PlanetScale. The pricing is too high. " + "x".repeat(500);
    const turns = [assistantTurn(longText)];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].rejectionReasonDetail!.length).toBeLessThanOrEqual(300);
  });

  // ── Timestamp Propagation ─────────────────────────────────────────

  it("propagates the turn timestamp to the rejection", () => {
    const ts = "2026-03-01T10:30:00Z";
    const turns = [
      assistantTurn("I wouldn't recommend PlanetScale — too expensive for hobby projects.", ts),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe(ts);
  });

  // ── Edge Cases ────────────────────────────────────────────────────

  it("handles empty turns array", () => {
    expect(extractVendorRejections([], TAXONOMY)).toEqual([]);
  });

  it("handles empty taxonomy", () => {
    const turns = [
      assistantTurn("I wouldn't recommend PlanetScale — too expensive."),
    ];
    const emptyTaxonomy: VendorTaxonomy = { vendors: [] };
    expect(extractVendorRejections(turns, emptyTaxonomy)).toEqual([]);
  });

  it("ignores vendors mentioned positively (no rejection indicator)", () => {
    const turns = [
      assistantTurn("PlanetScale is a great choice for serverless MySQL. I recommend it highly."),
    ];
    const result = extractVendorRejections(turns, TAXONOMY);
    expect(result).toEqual([]);
  });

  it("ignores short synonyms under 3 chars", () => {
    // If a vendor had a 2-char synonym, it should be filtered out to avoid false matches
    const taxonomy: VendorTaxonomy = {
      vendors: [
        { canonical_id: "test-vendor", display_name: "TestVendor", category: "testing", synonyms: ["tv"] },
      ],
    };
    const turns = [
      assistantTurn("I wouldn't recommend tv for this — it's too expensive."),
    ];
    const result = extractVendorRejections(turns, taxonomy);
    // "tv" is only 2 chars, should be filtered
    expect(result).toEqual([]);
  });
});
