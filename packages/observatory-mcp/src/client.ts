/**
 * HTTP client for the Vendor Observatory REST API.
 * Reads OBSERVATORY_URL and OBSERVATORY_API_KEY from environment.
 */

import type {
  VendorStatsRow,
  VendorWinRateResult,
  BenchmarkVendorCompRow,
  PrimaryVendorCountRow,
  HeadToHeadResult,
  SearchResult,
  FactorDef,
  VendorFactorData,
  ImprovementSuggestion,
  DashboardStats,
} from "./types.js";

// ── Configuration ───────────────────────────────────────────────────

function getConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.OBSERVATORY_URL;
  const apiKey = process.env.OBSERVATORY_API_KEY;

  if (!baseUrl) {
    throw new Error(
      "OBSERVATORY_URL is not set. Set it to your Vendor Observatory instance URL (e.g. https://app.vendorobservatory.com)",
    );
  }
  if (!apiKey) {
    throw new Error(
      "OBSERVATORY_API_KEY is not set. Create one at your observatory dashboard under Settings > API Keys.",
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

// ── HTTP helpers ────────────────────────────────────────────────────

async function apiGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const { baseUrl, apiKey } = getConfig();
  const url = new URL(path, baseUrl);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error("Authentication failed. Check your OBSERVATORY_API_KEY.");
    }
    if (response.status === 403) {
      throw new Error("Access denied. Your subscription may not cover this data.");
    }
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

// ── Public API ──────────────────────────────────────────────────────

export async function fetchVendorStats(
  vendor?: string,
  platform?: string,
  category?: string,
): Promise<VendorStatsRow[]> {
  const rows = await apiGet<VendorStatsRow[]>("/api/vendors", {
    vendor,
    platform,
    category,
  });
  return rows;
}

export async function fetchVendorWinRate(
  vendor: string,
  platform?: string,
): Promise<VendorWinRateResult> {
  return apiGet<VendorWinRateResult>("/api/query", {
    type: "vendorWinRate",
    vendor,
    platform,
  });
}

export async function fetchBenchmarkComparison(
  category?: string,
  platform?: string,
): Promise<BenchmarkVendorCompRow[]> {
  const data = await apiGet<{
    vendorComparison: BenchmarkVendorCompRow[];
  }>("/api/benchmarks", { category, platform });
  return data.vendorComparison ?? [];
}

export async function fetchPrimaryVendorCounts(
  category?: string,
  platform?: string,
): Promise<PrimaryVendorCountRow[]> {
  const data = await apiGet<{
    primaryVendorCounts: PrimaryVendorCountRow[];
  }>("/api/benchmarks", {
    category,
    platform,
    view: "primaryVendorCounts",
  });
  return data.primaryVendorCounts ?? [];
}

export async function fetchHeadToHead(
  vendorA: string,
  vendorB: string,
  platform?: string,
): Promise<HeadToHeadResult> {
  return apiGet<HeadToHeadResult>("/api/query", {
    type: "headToHead",
    vendorA,
    vendorB,
    platform,
  });
}

export async function fetchSearch(
  query: string,
  vendor?: string,
  category?: string,
  limit?: string,
): Promise<SearchResult[]> {
  return apiGet<SearchResult[]>("/api/search", {
    q: query,
    vendor,
    category,
    limit,
  });
}

export interface FactorsResponse {
  vendor: VendorFactorData;
  factors: FactorDef[];
  categoryId: string | null;
  categoryAvg: Record<string, number>;
  categoryBest: Record<string, number>;
  globalAvg: Record<string, number>;
  improvements: ImprovementSuggestion[];
}

export async function fetchVendorFactors(vendor: string): Promise<FactorsResponse> {
  return apiGet<FactorsResponse>("/api/factors", { vendor });
}

export async function fetchOverviewStats(): Promise<DashboardStats> {
  return apiGet<DashboardStats>("/api/health");
}

export async function fetchAllVendorStats(platform?: string): Promise<VendorStatsRow[]> {
  return apiGet<VendorStatsRow[]>("/api/vendors", { platform });
}
