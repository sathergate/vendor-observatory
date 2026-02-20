/**
 * Cross-Session Divergence Analyzer
 *
 * Three analytical passes:
 * 1. Platform divergence — do different platforms recommend different vendors for the same prompt?
 * 2. Constraint influence — which constraints most strongly shift vendor preference?
 * 3. Temporal drift — are vendor preferences changing over time?
 */

import type { ObservatoryDB } from "./db.js";

// ── Types ──────────────────────────────────────────────────────────

export interface DivergenceResult {
  promptId: string;
  platforms: Record<string, string | null>;
  isDivergent: boolean;
  divergenceScore: number;
}

export interface ConstraintInfluenceResult {
  constraint: string;
  influenceScore: number;
  vendorShifts: Array<{
    vendor: string;
    winRateWith: number;
    winRateWithout: number;
    delta: number;
  }>;
}

export interface DriftResult {
  vendor: string;
  earlyWinRate: number;
  lateWinRate: number;
  delta: number;
  isSignificant: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

// ── Analysis Functions ─────────────────────────────────────────────

export async function analyzePlatformDivergence(db: ObservatoryDB): Promise<DivergenceResult[]> {
  const allContexts = await db.getAllResponseContexts();

  // Group by prompt_id
  const promptMap = new Map<string, Array<{ platform: string; vendor: string | null }>>();
  for (const ctx of allContexts) {
    if (!promptMap.has(ctx.prompt_id)) promptMap.set(ctx.prompt_id, []);
    promptMap.get(ctx.prompt_id)!.push({
      platform: ctx.source_platform,
      vendor: ctx.primary_vendor,
    });
  }

  const results: DivergenceResult[] = [];
  for (const [promptId, entries] of promptMap.entries()) {
    // Need at least 2 platforms
    const platformVendors: Record<string, string | null> = {};
    for (const e of entries) {
      platformVendors[e.platform] = e.vendor;
    }
    const platforms = Object.keys(platformVendors);
    if (platforms.length < 2) continue;

    // Check if vendors diverge
    const uniqueVendors = new Set(Object.values(platformVendors).filter(Boolean));
    const isDivergent = uniqueVendors.size > 1;

    // Divergence score: 0 = agreement, 1 = all different
    const totalPairs = (platforms.length * (platforms.length - 1)) / 2;
    let disagreements = 0;
    for (let i = 0; i < platforms.length; i++) {
      for (let j = i + 1; j < platforms.length; j++) {
        if (platformVendors[platforms[i]] !== platformVendors[platforms[j]]) {
          disagreements++;
        }
      }
    }
    const divergenceScore = totalPairs > 0 ? disagreements / totalPairs : 0;

    const result: DivergenceResult = { promptId, platforms: platformVendors, isDivergent, divergenceScore };
    results.push(result);

    // Persist
    await db.upsertInsight("divergence", promptId, result);
  }

  return results;
}

export async function analyzeConstraintInfluence(db: ObservatoryDB): Promise<ConstraintInfluenceResult[]> {
  const allContexts = await db.getAllResponseContexts();

  // Collect all constraints from prompt_metadata
  const allMetas = await db.getAllPromptMetadata();
  const constraintSet = new Set<string>();
  const promptConstraints = new Map<string, string[]>();

  for (const meta of allMetas) {
    const constraints = safeJsonParse<string[]>(meta.constraints, []);
    promptConstraints.set(meta.prompt_id, constraints);
    for (const c of constraints) constraintSet.add(c);
  }

  // For each constraint, compute win rate delta per vendor
  const results: ConstraintInfluenceResult[] = [];

  for (const constraint of constraintSet) {
    // Split responses: with constraint vs without
    const withConstraint = allContexts.filter((ctx) => {
      const pc = promptConstraints.get(ctx.prompt_id) || [];
      return pc.includes(constraint) && ctx.primary_vendor;
    });
    const withoutConstraint = allContexts.filter((ctx) => {
      const pc = promptConstraints.get(ctx.prompt_id) || [];
      return !pc.includes(constraint) && ctx.primary_vendor;
    });

    if (withConstraint.length === 0 || withoutConstraint.length === 0) continue;

    // Get all vendors
    const allVendors = new Set<string>();
    for (const ctx of [...withConstraint, ...withoutConstraint]) {
      if (ctx.primary_vendor) allVendors.add(ctx.primary_vendor);
    }

    const vendorShifts: ConstraintInfluenceResult["vendorShifts"] = [];
    for (const vendor of allVendors) {
      const winsW = withConstraint.filter((c) => c.primary_vendor === vendor).length;
      const winsWO = withoutConstraint.filter((c) => c.primary_vendor === vendor).length;
      const wrW = withConstraint.length > 0 ? winsW / withConstraint.length : 0;
      const wrWO = withoutConstraint.length > 0 ? winsWO / withoutConstraint.length : 0;
      vendorShifts.push({ vendor, winRateWith: wrW, winRateWithout: wrWO, delta: wrW - wrWO });
    }

    // Influence score = max absolute delta across vendors
    const influenceScore = Math.max(...vendorShifts.map((v) => Math.abs(v.delta)));

    const result: ConstraintInfluenceResult = {
      constraint,
      influenceScore,
      vendorShifts: vendorShifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    };
    results.push(result);
    await db.upsertInsight("constraint_influence", null, result);
  }

  return results.sort((a, b) => b.influenceScore - a.influenceScore);
}

export async function analyzeTemporalDrift(db: ObservatoryDB): Promise<DriftResult[]> {
  const allContexts = await db.getAllResponseContexts();

  if (allContexts.length < 4) return [];

  // Sort by extracted_at
  const sorted = [...allContexts].sort((a, b) =>
    (a.extracted_at || "").localeCompare(b.extracted_at || ""),
  );

  // Split into early half and late half
  const midpoint = Math.floor(sorted.length / 2);
  const earlyHalf = sorted.slice(0, midpoint).filter((c) => c.primary_vendor);
  const lateHalf = sorted.slice(midpoint).filter((c) => c.primary_vendor);

  // Compute win rates per vendor
  const allVendors = new Set<string>();
  for (const ctx of [...earlyHalf, ...lateHalf]) {
    if (ctx.primary_vendor) allVendors.add(ctx.primary_vendor);
  }

  const results: DriftResult[] = [];
  for (const vendor of allVendors) {
    const earlyWins = earlyHalf.filter((c) => c.primary_vendor === vendor).length;
    const lateWins = lateHalf.filter((c) => c.primary_vendor === vendor).length;
    const earlyWinRate = earlyHalf.length > 0 ? earlyWins / earlyHalf.length : 0;
    const lateWinRate = lateHalf.length > 0 ? lateWins / lateHalf.length : 0;
    const delta = lateWinRate - earlyWinRate;
    const isSignificant = Math.abs(delta) > 0.15;

    if (isSignificant) {
      const result: DriftResult = { vendor, earlyWinRate, lateWinRate, delta, isSignificant };
      results.push(result);
      await db.upsertInsight("temporal_drift", null, result);
    }
  }

  return results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
