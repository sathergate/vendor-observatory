// ── Source Platforms ─────────────────────────────────────────────────

export type SourcePlatform = "claude_code" | "codex_cli" | "cursor" | "copilot";

// ── Mention / Observation Types ─────────────────────────────────────

export type MentionType =
  | "installed"
  | "configured"
  | "implemented"
  | "recommended"
  | "compared"
  | "mentioned"
  | "rejected";

export type WorkCategory =
  | "database" | "auth" | "hosting" | "ci_cd" | "monitoring"
  | "payments" | "email" | "storage" | "search" | "analytics"
  | "ai_ml" | "messaging" | "cdn" | "dns" | "observability"
  | "error_monitoring" | "feature_flags" | "secrets_management"
  | "developer_portal" | "llm_observability" | "incident_management"
  | "code_search" | "security_scanning" | "edge_compute" | "other";

// ── Vendor Mention (extracted from a transcript) ────────────────────

export interface VendorMention {
  vendorCanonicalId: string;
  vendorRaw: string;
  mentionType: MentionType;
  confidence: number;
  contextSnippet: string;
  userPromptSnippet: string | null;
  timestamp: string;
  workCategory: WorkCategory | null;
}

// ── Parsed Transcript Structures ────────────────────────────────────

export interface ToolUseRecord {
  toolName: string;
  input: Record<string, unknown>;
  id: string;
}

export interface ToolResultRecord {
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface ParsedTurn {
  role: "user" | "assistant";
  textContent: string;
  toolUses: ToolUseRecord[];
  toolResults: ToolResultRecord[];
  timestamp: string;
}

export interface ParsedSession {
  id: string;
  platform: SourcePlatform;
  modelId: string | null;
  cwd: string | null;
  gitBranch: string | null;
  startedAt: string;
  endedAt: string | null;
  turns: ParsedTurn[];
  filePath: string;
}

// ── Database Row Types ──────────────────────────────────────────────

export interface IngestedFileRow {
  id: number;
  file_path: string;
  file_size: number;
  file_mtime: string;
  source_platform: SourcePlatform;
  ingested_at: string;
  session_count: number;
}

export interface SessionRow {
  id: string;
  source_platform: SourcePlatform;
  model_id: string | null;
  started_at: string;
  ended_at: string | null;
  cwd: string | null;
  git_branch: string | null;
  turn_count: number;
  file_path: string;
  is_benchmark: number;
}

export interface ObservationRow {
  id: number;
  session_id: string;
  vendor_canonical_id: string;
  vendor_raw: string;
  mention_type: MentionType;
  work_category: string | null;
  confidence: number;
  context_snippet: string | null;
  user_prompt_snippet: string | null;
  timestamp: string;
}

export interface ToolActionRow {
  id: number;
  session_id: string;
  tool_name: string;
  command_or_path: string | null;
  vendor_canonical_id: string | null;
  action_type: string | null;
  success: number | null;
  timestamp: string;
}

// ── Vendor Taxonomy ─────────────────────────────────────────────────

export interface VendorEntry {
  canonical_id: string;
  display_name: string;
  synonyms: string[];
  category: string;
  website?: string;
}

export interface VendorTaxonomy {
  vendors: VendorEntry[];
}

// ── Aggregated Stats (for web layer) ────────────────────────────────

export interface VendorStats {
  vendor_canonical_id: string;
  display_name: string;
  category: string;
  total: number;
  installed: number;
  configured: number;
  implemented: number;
  recommended: number;
  compared: number;
  mentioned: number;
  rejected: number;
  platforms: string;
}

export interface PlatformStats {
  vendor_canonical_id: string;
  display_name: string;
  claude_code_count: number;
  codex_cli_count: number;
  delta: number;
}

export interface CoOccurrence {
  vendor_a: string;
  vendor_b: string;
  co_occurrence_count: number;
  sessions: string;
}

export interface TimelinePoint {
  week: string;
  vendor_canonical_id: string;
  count: number;
}

export interface FunnelStats {
  vendor_canonical_id: string;
  display_name: string;
  mentioned_total: number;
  recommended_total: number;
  installed_total: number;
  conversion_rate: number;
}

export interface DashboardStats {
  totalSessions: number;
  totalObservations: number;
  uniqueVendors: number;
  platformBreakdown: Record<string, number>;
  lastIngestedAt: string | null;
}
