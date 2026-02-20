/**
 * Composable Query Engine
 *
 * Six query types for ad-hoc analytical questions:
 * 1. vendorWinRate — win rate with breakdowns by filter dimension
 * 2. constraintCorrelation — per-vendor win/loss when constraint appears
 * 3. platformComparison — platform → vendor side-by-side for a prompt/category
 * 4. headToHead — delegates to existing getVendorHeadToHead
 * 5. promptDifficulty — Shannon entropy of vendor distribution
 * 6. whatIf — simulated win rate delta from historical data
 */

import { Pool } from "pg";
import { safeJsonParse } from "./db";

// ── Lazy Pool (same pattern as db.ts) ──────────────────────────────────

let _pool: Pool | null = null;
let _poolFailed = false;

function getPool(): Pool | null {
  if (_poolFailed) return null;
  if (_pool) return _pool;
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) { _poolFailed = true; return null; }
    _pool = new Pool({ connectionString });
    return _pool;
  } catch { _poolFailed = true; return null; }
}

async function hasTable(pool: Pool, name: string): Promise<boolean> {
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public'",
    [name],
  );
  return rows.length > 0;
}

// ── Types ─────────────────────────────────────────────────────────────

export interface VendorWinRateResult {
  vendor: string;
  winRate: number;
  wins: number;
  total: number;
  breakdown: Array<{
    dimension: string;
    value: string;
    wins: number;
    total: number;
    winRate: number;
  }>;
}

export interface ConstraintCorrelationResult {
  constraint: string;
  vendors: Array<{
    vendor: string;
    winsWithConstraint: number;
    totalWithConstraint: number;
    winRateWith: number;
    winsWithout: number;
    totalWithout: number;
    winRateWithout: number;
    delta: number;
  }>;
}

export interface PlatformComparisonResult {
  groupKey: string; // prompt_id or category
  groupType: "prompt" | "category";
  platforms: Record<string, {
    primaryVendor: string | null;
    vendorCounts: Record<string, number>;
    responseCount: number;
  }>;
}

export interface PromptDifficultyResult {
  promptId: string;
  entropy: number;        // Shannon entropy — higher = more contested
  vendorCount: number;
  responseCount: number;
  vendorDistribution: Record<string, number>;
  dominantVendor: string | null;
  dominanceScore: number; // 0-1, 1 = single vendor wins all
}

export interface WhatIfResult {
  vendor: string;
  currentWinRate: number;
  currentWins: number;
  currentTotal: number;
  simulatedWinRate: number;
  simulatedWins: number;
  simulatedTotal: number;
  delta: number;
  addedConstraint: string | null;
  removedConstraint: string | null;
}

export interface AutocompleteData {
  vendors: string[];
  constraints: string[];
  categories: string[];
  platforms: string[];
  promptIds: string[];
}

// ── Query Functions ──────────────────────────────────────────────────

export async function queryVendorWinRate(
  vendor: string,
  filters?: { category?: string; platform?: string; constraint?: string },
): Promise<VendorWinRateResult | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    if (!(await hasTable(pool, "response_context"))) return null;

    const { rows: allResponses } = await pool.query(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, rc.constraints_addressed,
             s.source_platform, pm.category, pm.constraints
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
    `);

    type ResponseRow = {
      primary_vendor: string | null;
      vendors_mentioned: string;
      constraints_addressed: string;
      source_platform: string;
      category: string | null;
      constraints: string | null;
    };

    // Filter to responses mentioning this vendor
    let relevant = (allResponses as ResponseRow[]).filter((r) => {
      const isPrimary = r.primary_vendor === vendor;
      const vendors = safeJsonParse<Array<{ vendor: string }>>(r.vendors_mentioned, []);
      return isPrimary || vendors.some((v) => v.vendor === vendor);
    });

    // Apply filters
    if (filters?.category) {
      relevant = relevant.filter((r) => r.category === filters.category);
    }
    if (filters?.platform) {
      relevant = relevant.filter((r) => r.source_platform === filters.platform);
    }
    if (filters?.constraint) {
      relevant = relevant.filter((r) => {
        const constraints = safeJsonParse<string[]>(r.constraints, []);
        return constraints.includes(filters.constraint!);
      });
    }

    const wins = relevant.filter((r) => r.primary_vendor === vendor).length;
    const total = relevant.length;

    // Compute breakdown by the most informative dimension
    const breakdownDim = filters?.category ? "platform" : "category";
    const breakdownMap = new Map<string, { wins: number; total: number }>();

    for (const r of relevant) {
      const key = breakdownDim === "platform" ? r.source_platform : (r.category || "unknown");
      if (!breakdownMap.has(key)) breakdownMap.set(key, { wins: 0, total: 0 });
      const entry = breakdownMap.get(key)!;
      entry.total++;
      if (r.primary_vendor === vendor) entry.wins++;
    }

    const breakdown = Array.from(breakdownMap.entries())
      .map(([value, data]) => ({
        dimension: breakdownDim,
        value,
        wins: data.wins,
        total: data.total,
        winRate: data.total > 0 ? data.wins / data.total : 0,
      }))
      .sort((a, b) => b.winRate - a.winRate);

    return {
      vendor,
      winRate: total > 0 ? wins / total : 0,
      wins,
      total,
      breakdown,
    };
  } catch { return null; }
}

export async function queryConstraintCorrelation(
  constraint: string,
): Promise<ConstraintCorrelationResult | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return null;

    const { rows: allResponses } = await pool.query(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, pm.constraints
      FROM response_context rc
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
      WHERE rc.primary_vendor IS NOT NULL
    `);

    type ResponseRow = {
      primary_vendor: string;
      vendors_mentioned: string;
      constraints: string | null;
    };

    // Split into with/without constraint
    const withConstraint: ResponseRow[] = [];
    const withoutConstraint: ResponseRow[] = [];

    for (const r of allResponses as ResponseRow[]) {
      const constraints = safeJsonParse<string[]>(r.constraints, []);
      if (constraints.includes(constraint)) {
        withConstraint.push(r);
      } else {
        withoutConstraint.push(r);
      }
    }

    // Get all vendors that appear
    const vendorSet = new Set<string>();
    for (const r of [...withConstraint, ...withoutConstraint]) {
      vendorSet.add(r.primary_vendor);
    }

    const vendors = Array.from(vendorSet).map((vendor) => {
      const winsW = withConstraint.filter((r) => r.primary_vendor === vendor).length;
      const totalW = withConstraint.length;
      const winsWO = withoutConstraint.filter((r) => r.primary_vendor === vendor).length;
      const totalWO = withoutConstraint.length;
      const winRateW = totalW > 0 ? winsW / totalW : 0;
      const winRateWO = totalWO > 0 ? winsWO / totalWO : 0;

      return {
        vendor,
        winsWithConstraint: winsW,
        totalWithConstraint: totalW,
        winRateWith: winRateW,
        winsWithout: winsWO,
        totalWithout: totalWO,
        winRateWithout: winRateWO,
        delta: winRateW - winRateWO,
      };
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return { constraint, vendors };
  } catch { return null; }
}

export async function queryPlatformComparison(
  key: string,
  keyType: "prompt" | "category" = "prompt",
): Promise<PlatformComparisonResult | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    if (!(await hasTable(pool, "response_context"))) return null;

    const whereClause = keyType === "prompt" ? "rc.prompt_id = $1" : "pm.category = $1";

    const { rows: responses } = await pool.query(`
      SELECT rc.primary_vendor, s.source_platform
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
      WHERE ${whereClause}
    `, [key]);

    const platforms: PlatformComparisonResult["platforms"] = {};

    for (const r of responses as Array<{ primary_vendor: string | null; source_platform: string }>) {
      if (!platforms[r.source_platform]) {
        platforms[r.source_platform] = { primaryVendor: null, vendorCounts: {}, responseCount: 0 };
      }
      const p = platforms[r.source_platform];
      p.responseCount++;
      if (r.primary_vendor) {
        p.vendorCounts[r.primary_vendor] = (p.vendorCounts[r.primary_vendor] || 0) + 1;
      }
    }

    // Set primaryVendor as the most common one per platform
    for (const p of Object.values(platforms)) {
      const topEntry = Object.entries(p.vendorCounts).sort((a, b) => b[1] - a[1])[0];
      p.primaryVendor = topEntry?.[0] ?? null;
    }

    return { groupKey: key, groupType: keyType, platforms };
  } catch { return null; }
}

export async function queryPromptDifficulty(promptId: string): Promise<PromptDifficultyResult | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    if (!(await hasTable(pool, "response_context"))) return null;

    const { rows: responses } = await pool.query(
      "SELECT primary_vendor FROM response_context WHERE prompt_id = $1 AND primary_vendor IS NOT NULL",
      [promptId],
    );

    if (responses.length === 0) return null;

    const vendorCounts: Record<string, number> = {};
    for (const r of responses as Array<{ primary_vendor: string }>) {
      vendorCounts[r.primary_vendor] = (vendorCounts[r.primary_vendor] || 0) + 1;
    }

    const total = responses.length;
    const vendorCount = Object.keys(vendorCounts).length;

    // Shannon entropy
    let entropy = 0;
    for (const count of Object.values(vendorCounts)) {
      const p = count / total;
      if (p > 0) entropy -= p * Math.log2(p);
    }

    const topEntry = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1])[0];
    const dominanceScore = topEntry ? topEntry[1] / total : 0;

    return {
      promptId,
      entropy,
      vendorCount,
      responseCount: total,
      vendorDistribution: vendorCounts,
      dominantVendor: topEntry?.[0] ?? null,
      dominanceScore,
    };
  } catch { return null; }
}

export async function queryWhatIf(
  vendor: string,
  addConstraint?: string,
  removeConstraint?: string,
): Promise<WhatIfResult | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return null;

    const { rows: allResponses } = await pool.query(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, pm.constraints
      FROM response_context rc
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
    `);

    type ResponseRow = {
      primary_vendor: string | null;
      vendors_mentioned: string;
      constraints: string | null;
    };

    // Current: responses where this vendor is mentioned
    const currentRelevant = (allResponses as ResponseRow[]).filter((r) => {
      const isPrimary = r.primary_vendor === vendor;
      const vendors = safeJsonParse<Array<{ vendor: string }>>(r.vendors_mentioned, []);
      return isPrimary || vendors.some((v) => v.vendor === vendor);
    });

    const currentWins = currentRelevant.filter((r) => r.primary_vendor === vendor).length;
    const currentTotal = currentRelevant.length;
    const currentWinRate = currentTotal > 0 ? currentWins / currentTotal : 0;

    // Simulated: filter the pool based on constraint changes
    let simulated = [...currentRelevant];

    if (addConstraint) {
      simulated = simulated.filter((r) => {
        const constraints = safeJsonParse<string[]>(r.constraints, []);
        return constraints.includes(addConstraint);
      });
    }

    if (removeConstraint) {
      simulated = simulated.filter((r) => {
        const constraints = safeJsonParse<string[]>(r.constraints, []);
        return !constraints.includes(removeConstraint);
      });
    }

    const simulatedWins = simulated.filter((r) => r.primary_vendor === vendor).length;
    const simulatedTotal = simulated.length;
    const simulatedWinRate = simulatedTotal > 0 ? simulatedWins / simulatedTotal : 0;

    return {
      vendor,
      currentWinRate,
      currentWins,
      currentTotal,
      simulatedWinRate,
      simulatedWins,
      simulatedTotal,
      delta: simulatedWinRate - currentWinRate,
      addedConstraint: addConstraint ?? null,
      removedConstraint: removeConstraint ?? null,
    };
  } catch { return null; }
}

// ── Autocomplete Data ────────────────────────────────────────────────

export async function getQueryAutocompleteData(): Promise<AutocompleteData> {
  const pool = getPool();
  if (!pool) return { vendors: [], constraints: [], categories: [], platforms: [], promptIds: [] };
  try {
    const vendors: string[] = [];
    const constraints = new Set<string>();
    const categories: string[] = [];
    const platforms: string[] = [];
    const promptIds: string[] = [];

    // Vendors from response_context
    if (await hasTable(pool, "response_context")) {
      const { rows: vendorRows } = await pool.query(
        "SELECT DISTINCT primary_vendor FROM response_context WHERE primary_vendor IS NOT NULL ORDER BY primary_vendor"
      );
      vendors.push(...(vendorRows as Array<{ primary_vendor: string }>).map((r) => r.primary_vendor));

      const { rows: promptRows } = await pool.query(
        "SELECT DISTINCT prompt_id FROM response_context ORDER BY prompt_id"
      );
      promptIds.push(...(promptRows as Array<{ prompt_id: string }>).map((r) => r.prompt_id));
    }

    // Categories + constraints from prompt_metadata
    if (await hasTable(pool, "prompt_metadata")) {
      const { rows: catRows } = await pool.query(
        "SELECT DISTINCT category FROM prompt_metadata WHERE category IS NOT NULL ORDER BY category"
      );
      categories.push(...(catRows as Array<{ category: string }>).map((r) => r.category));

      const { rows: constraintRows } = await pool.query(
        "SELECT constraints FROM prompt_metadata WHERE constraints IS NOT NULL"
      );
      for (const r of constraintRows as Array<{ constraints: string }>) {
        const parsed = safeJsonParse<string[]>(r.constraints, []);
        for (const c of parsed) constraints.add(c);
      }
    }

    // Platforms from sessions
    try {
      const { rows: platRows } = await pool.query(
        "SELECT DISTINCT source_platform FROM sessions ORDER BY source_platform"
      );
      platforms.push(...(platRows as Array<{ source_platform: string }>).map((r) => r.source_platform));
    } catch { /* sessions table may not exist */ }

    return {
      vendors,
      constraints: Array.from(constraints).sort(),
      categories,
      platforms,
      promptIds,
    };
  } catch { return { vendors: [], constraints: [], categories: [], platforms: [], promptIds: [] }; }
}
