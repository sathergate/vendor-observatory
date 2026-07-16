import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

// ── Types ────────────────────────────────────────────────────────────

export type FactorWeight = "very_high" | "high" | "medium_high" | "medium";
export type Confidence = "high" | "medium" | "low";

export interface FactorDef {
  id: string;
  label: string;
  short: string;
  weight: FactorWeight;
  description: string;
}

export interface VendorFactorEntry {
  vendor_id: string;
  confidence: Confidence;
  scores: Record<string, number | null>;
  notes?: string;
}

interface VendorFactorsYaml {
  version: string;
  description: string;
  factors: FactorDef[];
  vendors: VendorFactorEntry[];
}

// ── Computed types ───────────────────────────────────────────────────

export interface VendorFactorData {
  vendorId: string;
  confidence: Confidence;
  scores: Record<string, number | null>;
  notes?: string;
  compositeScore: number;
  factorCount: number;
}

export interface CategoryFactorSummary {
  categoryId: string;
  vendorCount: number;
  avgScores: Record<string, number>;
  bestScores: Record<string, number>;
  vendors: VendorFactorData[];
}

export interface FactorDataset {
  factors: FactorDef[];
  vendors: VendorFactorData[];
  byCategory: Record<string, CategoryFactorSummary>;
  globalAvg: Record<string, number>;
}

// ── Loader ───────────────────────────────────────────────────────────

let cached: FactorDataset | null = null;

export function loadVendorFactors(): FactorDataset {
  if (cached) return cached;

  const yamlPath = join(process.cwd(), "..", "..", "taxonomy", "vendor-factors.yaml");
  const raw = readFileSync(yamlPath, "utf-8");
  const data = parse(raw) as VendorFactorsYaml;

  // Import vendor metadata to get categories
  // We use a lazy require to avoid circular deps with the YAML-based approach
  const { VENDOR_META } = require("./vendor-taxonomy");

  const factorIds = data.factors.map((f) => f.id);

  // Build vendor data with composite scores
  const vendors: VendorFactorData[] = data.vendors.map((v) => {
    const scoredFactors = factorIds.filter((fid) => v.scores[fid] != null);
    const sum = scoredFactors.reduce((acc, fid) => acc + (v.scores[fid] ?? 0), 0);
    return {
      vendorId: v.vendor_id,
      confidence: v.confidence,
      scores: v.scores,
      notes: v.notes,
      compositeScore: scoredFactors.length > 0 ? sum / scoredFactors.length : 0,
      factorCount: scoredFactors.length,
    };
  });

  // Group by category
  const byCategory: Record<string, CategoryFactorSummary> = {};
  for (const vendor of vendors) {
    const category = VENDOR_META[vendor.vendorId]?.category ?? "unknown";
    if (!byCategory[category]) {
      byCategory[category] = {
        categoryId: category,
        vendorCount: 0,
        avgScores: {},
        bestScores: {},
        vendors: [],
      };
    }
    byCategory[category].vendors.push(vendor);
    byCategory[category].vendorCount++;
  }

  // Compute category averages and bests
  for (const cat of Object.values(byCategory)) {
    for (const fid of factorIds) {
      const scores = cat.vendors
        .map((v) => v.scores[fid])
        .filter((s): s is number => s != null);
      cat.avgScores[fid] = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      cat.bestScores[fid] = scores.length > 0 ? Math.max(...scores) : 0;
    }
  }

  // Compute global averages
  const globalAvg: Record<string, number> = {};
  for (const fid of factorIds) {
    const scores = vendors
      .map((v) => v.scores[fid])
      .filter((s): s is number => s != null);
    globalAvg[fid] = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  cached = { factors: data.factors, vendors, byCategory, globalAvg };
  return cached;
}

// ── Helpers ──────────────────────────────────────────────────────────

export function getVendorFactors(vendorId: string): VendorFactorData | null {
  const dataset = loadVendorFactors();
  return dataset.vendors.find((v) => v.vendorId === vendorId) ?? null;
}

export function getCategoryFactors(categoryId: string): CategoryFactorSummary | null {
  const dataset = loadVendorFactors();
  return dataset.byCategory[categoryId] ?? null;
}

export function getWeightMultiplier(weight: FactorWeight): number {
  switch (weight) {
    case "very_high": return 4;
    case "high": return 3;
    case "medium_high": return 2;
    case "medium": return 1;
  }
}
