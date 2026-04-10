// ── API Response Types ──────────────────────────────────────────────
// These match the shapes returned by the observatory REST API.

export interface VendorStatsRow {
  vendor_canonical_id: string;
  total: number;
  installed: number;
  configured: number;
  implemented: number;
  recommended: number;
  compared: number;
  mentioned: number;
  rejected: number;
  platforms: string;
  work_category: string;
}

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

export interface BenchmarkVendorCompRow {
  vendor_canonical_id: string;
  claude_code_count: number;
  codex_cli_count: number;
  cursor_count: number;
  total: number;
}

export interface PrimaryVendorCountRow {
  primary_vendor: string;
  win_count: number;
}

export interface HeadToHeadResult {
  vendorA: string;
  vendorB: string;
  scenarios: Array<{
    prompt_id: string;
    category: string;
    winner: string | null;
    rationale: string | null;
  }>;
  aWins: number;
  bWins: number;
  ties: number;
}

export interface SearchResult {
  source_type: string;
  source_id: string;
  vendor: string;
  category: string;
  platform: string;
  prompt_id: string;
  snippet: string;
  rank: number;
}

export interface FactorDef {
  id: string;
  label: string;
  short: string;
  weight: string;
  description: string;
}

export interface VendorFactorData {
  vendorId: string;
  confidence: string;
  scores: Record<string, number | null>;
  notes?: string;
  compositeScore: number;
  factorCount: number;
}

export interface ImprovementSuggestion {
  vendorId: string;
  factorId: string;
  factorLabel: string;
  priority: string;
  title: string;
  description: string;
  impact: string;
  score: number;
  categoryAvg: number;
  categoryBest: number;
  gap: number;
}

export interface DashboardStats {
  totalSessions: number;
  totalObservations: number;
  uniqueVendors: number;
  platformBreakdown: Record<string, number>;
  lastIngestedAt: string | null;
}
