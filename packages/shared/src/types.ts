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

// ── Enrichment: Content & Pattern Tags ──────────────────────────────

export type ContentTag =
  | "existing_system"       // 1: existing stack + failure mode
  | "compliance_security"   // 2: SOC2/HIPAA/GDPR, residency, encryption, audit
  | "workload_shape"        // 3: RPS, concurrency, read/write mix, burstiness
  | "ecosystem_coupling"    // 4: framework, ORM, hosting, CI/preview env
  | "compatibility";        // 5: true Postgres vs wire-compat, extensions, dialect

export type PatternTag =
  | "pain_point"            // A: starts from concrete production/dev pain
  | "constraint_driven"     // B: leads with non-negotiables
  | "workload_driven"       // C: specifies traffic/data shape
  | "llm_era"              // D: embeddings, vector, hybrid transactional+vector
  | "existing_vendor";      // E: already using X, asks for setup/migration

export type VendorDisposition =
  | "recommended"
  | "compared"
  | "rejected"
  | "mentioned"
  | "implemented";

// ── Enrichment: DB Row Types ────────────────────────────────────────

export interface PromptMetadataRow {
  id: number;
  prompt_id: string;
  category: string;
  content_tags: string;    // JSON array of ContentTag
  pattern_tags: string;    // JSON array of PatternTag
  constraints: string;     // JSON array of strings
  existing_stack: string;  // JSON array of strings
  failure_mode: string | null;
  vendors_named_in_prompt: string; // JSON array of strings
}

export interface ResponseContextRow {
  id: number;
  session_id: string;
  prompt_id: string;
  primary_vendor: string | null;
  is_implemented: number;  // 0 or 1
  rationale_snippet: string | null;
  vendors_mentioned: string;    // JSON array of { vendor, disposition }
  trade_offs_snippet: string | null;
  gotchas_snippet: string | null;
  constraints_addressed: string; // JSON array of strings
  reasoning_chain: string | null;
  disqualification_reasons: string | null; // JSON array of { vendor, reason }
  confidence_score: number | null;
  extracted_at: string;
}

export interface PromptIntentRow {
  id: number;
  session_id: string;
  prompt_id: string;
  intent: DeveloperIntent;
  confidence: number;
  sub_intent: string | null;
  classifier: string; // "rule" or "llm"
  classified_at: string;
}

// ── Enrichment: Parsed Types (for runtime use) ─────────────────────

export interface VendorDispositionEntry {
  vendor: string;
  disposition: VendorDisposition;
}

export interface DisqualificationReason {
  vendor: string;
  reason: string;
}

export interface ExtractedResponseContext {
  primaryVendor: string | null;
  isImplemented: boolean;
  rationaleSnippet: string | null;
  vendorsMentioned: VendorDispositionEntry[];
  tradeOffsSnippet: string | null;
  gotchasSnippet: string | null;
  constraintsAddressed: string[];
  // LLM enrichment fields (optional — populated when ENRICHMENT_ENABLED=true)
  reasoningChain: string | null;
  disqualificationReasons: DisqualificationReason[];
  confidenceScore: number | null;
}

// ── Developer Intent Classification ─────────────────────────────────

export type DeveloperIntent =
  | "evaluation"        // "compare X vs Y", "which is better"
  | "migration"         // "migrate from X", "switch from"
  | "greenfield"        // "set up from scratch", "new project"
  | "debugging"         // "fix", "error", "not working"
  | "architecture"      // "best practice", "how should I structure"
  | "compliance"        // "SOC2", "HIPAA", "GDPR"
  | "cost_optimization" // "cheaper", "reduce cost", "free tier"
  | "unknown";

export interface IntentClassification {
  intent: DeveloperIntent;
  confidence: number;  // 0-1
  subIntent: string | null;
  classifier: "rule" | "llm";
}

// ── Enrichment: Aggregated Stats ────────────────────────────────────

export interface EnrichmentFilterOptions {
  contentTag?: ContentTag;
  patternTag?: PatternTag;
  constraint?: string;
  category?: string;
  platform?: string;
}

export interface PromptEnrichmentStats {
  prompt_id: string;
  category: string;
  content_tags: ContentTag[];
  pattern_tags: PatternTag[];
  constraints: string[];
  session_count: number;
  primary_vendor_counts: Record<string, number>;
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
