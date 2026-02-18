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

import Database from "better-sqlite3";
import path from "path";
import { existsSync, copyFileSync } from "fs";

// ── Lazy DB (same pattern as db.ts) ──────────────────────────────────

let _db: Database.Database | null = null;
let _dbFailed = false;

function findSourceDbPath(): string | null {
  if (process.env.OBS_DB_PATH) return process.env.OBS_DB_PATH;
  const candidates = [
    path.resolve(process.cwd(), "../../db/observatory.sqlite"),
    path.resolve(process.cwd(), "db/observatory.sqlite"),
    path.resolve(__dirname, "../../db/observatory.sqlite"),
    path.resolve(__dirname, "../../../db/observatory.sqlite"),
    path.resolve(__dirname, "../../../../db/observatory.sqlite"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function getDb(): Database.Database | null {
  if (_dbFailed) return null;
  if (_db) return _db;
  try {
    const sourcePath = findSourceDbPath();
    if (!sourcePath) { _dbFailed = true; return null; }
    let dbPath = sourcePath;
    const tmpPath = "/tmp/observatory.sqlite";
    if (process.env.VERCEL || !existsSync(path.dirname(sourcePath) + "/.writable_check")) {
      if (!existsSync(tmpPath)) copyFileSync(sourcePath, tmpPath);
      dbPath = tmpPath;
    }
    _db = new Database(dbPath, { readonly: true, fileMustExist: true });
    return _db;
  } catch { _dbFailed = true; return null; }
}

function hasTable(db: Database.Database, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) as { name: string } | undefined;
  return !!row;
}

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
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

export function queryVendorWinRate(
  vendor: string,
  filters?: { category?: string; platform?: string; constraint?: string },
): VendorWinRateResult | null {
  const db = getDb();
  if (!db) return null;
  try {
    if (!hasTable(db, "response_context")) return null;

    // Build base query for all responses mentioning this vendor
    const allResponses = db.prepare(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, rc.constraints_addressed,
             s.source_platform, pm.category, pm.constraints
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
    `).all() as Array<{
      primary_vendor: string | null;
      vendors_mentioned: string;
      constraints_addressed: string;
      source_platform: string;
      category: string | null;
      constraints: string | null;
    }>;

    // Filter to responses mentioning this vendor
    let relevant = allResponses.filter((r) => {
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

export function queryConstraintCorrelation(
  constraint: string,
): ConstraintCorrelationResult | null {
  const db = getDb();
  if (!db) return null;
  try {
    if (!hasTable(db, "response_context") || !hasTable(db, "prompt_metadata")) return null;

    const allResponses = db.prepare(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, pm.constraints
      FROM response_context rc
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
      WHERE rc.primary_vendor IS NOT NULL
    `).all() as Array<{
      primary_vendor: string;
      vendors_mentioned: string;
      constraints: string | null;
    }>;

    // Split into with/without constraint
    const withConstraint: typeof allResponses = [];
    const withoutConstraint: typeof allResponses = [];

    for (const r of allResponses) {
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

export function queryPlatformComparison(
  key: string,
  keyType: "prompt" | "category" = "prompt",
): PlatformComparisonResult | null {
  const db = getDb();
  if (!db) return null;
  try {
    if (!hasTable(db, "response_context")) return null;

    let whereClause: string;
    if (keyType === "prompt") {
      whereClause = "rc.prompt_id = ?";
    } else {
      whereClause = "pm.category = ?";
    }

    const responses = db.prepare(`
      SELECT rc.primary_vendor, s.source_platform
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
      WHERE ${whereClause}
    `).all(key) as Array<{
      primary_vendor: string | null;
      source_platform: string;
    }>;

    const platforms: PlatformComparisonResult["platforms"] = {};

    for (const r of responses) {
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

export function queryPromptDifficulty(promptId: string): PromptDifficultyResult | null {
  const db = getDb();
  if (!db) return null;
  try {
    if (!hasTable(db, "response_context")) return null;

    const responses = db.prepare(`
      SELECT primary_vendor FROM response_context WHERE prompt_id = ? AND primary_vendor IS NOT NULL
    `).all(promptId) as Array<{ primary_vendor: string }>;

    if (responses.length === 0) return null;

    const vendorCounts: Record<string, number> = {};
    for (const r of responses) {
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

export function queryWhatIf(
  vendor: string,
  addConstraint?: string,
  removeConstraint?: string,
): WhatIfResult | null {
  const db = getDb();
  if (!db) return null;
  try {
    if (!hasTable(db, "response_context") || !hasTable(db, "prompt_metadata")) return null;

    const allResponses = db.prepare(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, pm.constraints
      FROM response_context rc
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
    `).all() as Array<{
      primary_vendor: string | null;
      vendors_mentioned: string;
      constraints: string | null;
    }>;

    // Current: responses where this vendor is mentioned
    const currentRelevant = allResponses.filter((r) => {
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
      // Only keep responses from prompts that have the added constraint
      simulated = simulated.filter((r) => {
        const constraints = safeJsonParse<string[]>(r.constraints, []);
        return constraints.includes(addConstraint);
      });
    }

    if (removeConstraint) {
      // Only keep responses from prompts that DON'T have the removed constraint
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

export function getQueryAutocompleteData(): AutocompleteData {
  const db = getDb();
  if (!db) return { vendors: [], constraints: [], categories: [], platforms: [], promptIds: [] };
  try {
    const vendors: string[] = [];
    const constraints = new Set<string>();
    const categories: string[] = [];
    const platforms: string[] = [];
    const promptIds: string[] = [];

    // Vendors from response_context
    if (hasTable(db, "response_context")) {
      const vendorRows = db.prepare(`
        SELECT DISTINCT primary_vendor FROM response_context WHERE primary_vendor IS NOT NULL ORDER BY primary_vendor
      `).all() as Array<{ primary_vendor: string }>;
      vendors.push(...vendorRows.map((r) => r.primary_vendor));

      const promptRows = db.prepare(`
        SELECT DISTINCT prompt_id FROM response_context ORDER BY prompt_id
      `).all() as Array<{ prompt_id: string }>;
      promptIds.push(...promptRows.map((r) => r.prompt_id));
    }

    // Categories + constraints from prompt_metadata
    if (hasTable(db, "prompt_metadata")) {
      const catRows = db.prepare(`
        SELECT DISTINCT category FROM prompt_metadata WHERE category IS NOT NULL ORDER BY category
      `).all() as Array<{ category: string }>;
      categories.push(...catRows.map((r) => r.category));

      const constraintRows = db.prepare(`
        SELECT constraints FROM prompt_metadata WHERE constraints IS NOT NULL
      `).all() as Array<{ constraints: string }>;
      for (const r of constraintRows) {
        const parsed = safeJsonParse<string[]>(r.constraints, []);
        for (const c of parsed) constraints.add(c);
      }
    }

    // Platforms from sessions
    try {
      const platRows = db.prepare(`
        SELECT DISTINCT source_platform FROM sessions ORDER BY source_platform
      `).all() as Array<{ source_platform: string }>;
      platforms.push(...platRows.map((r) => r.source_platform));
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
