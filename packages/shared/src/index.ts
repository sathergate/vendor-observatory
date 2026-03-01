// ── Types ────────────────────────────────────────────────────────────
export type {
  SourcePlatform,
  MentionType,
  WorkCategory,
  VendorMention,
  ToolUseRecord,
  ToolResultRecord,
  ParsedTurn,
  ParsedSession,
  IngestedFileRow,
  SessionRow,
  ObservationRow,
  ToolActionRow,
  CategoryRow,
  VendorEntry,
  VendorTaxonomy,
  VendorStats,
  PlatformStats,
  CoOccurrence,
  TimelinePoint,
  FunnelStats,
  DashboardStats,
  // Enrichment types
  ContentTag,
  PatternTag,
  VendorDisposition,
  PromptMetadataRow,
  ResponseContextRow,
  VendorDispositionEntry,
  ExtractedResponseContext,
  DisqualificationReason,
  EnrichmentFilterOptions,
  PromptEnrichmentStats,
  // Intent classification types
  DeveloperIntent,
  IntentClassification,
  PromptIntentRow,
} from "./types.js";

// ── Extractor ───────────────────────────────────────────────────────
export { extractVendorMentions } from "./extractor.js";

// ── Reasoning Extractor ─────────────────────────────────────────────
export { extractResponseContext } from "./reasoning-extractor.js";

// ── LLM Enrichment ──────────────────────────────────────────────────
export {
  isEnrichmentEnabled,
  getEnrichmentModel,
  extractResponseContextWithLLM,
} from "./llm-enrichment.js";

// ── Intent Classification ───────────────────────────────────────────
export { classifyIntent, classifyIntents } from "./intent-classifier.js";

// ── Package Map ─────────────────────────────────────────────────────
export { PACKAGE_TO_VENDOR, resolvePackageToVendor } from "./package-map.js";

// ── Normalizer ──────────────────────────────────────────────────────
export { normalizeVendorName } from "./normalizer.js";

// ── Default Categories ──────────────────────────────────────────────
export { DEFAULT_CATEGORIES } from "./default-categories.js";
export type { CategoryMeta } from "./default-categories.js";

// ── Loaders ─────────────────────────────────────────────────────────
export { loadVendorTaxonomy } from "./taxonomy-loader.js";
