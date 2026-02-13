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
  VendorEntry,
  VendorTaxonomy,
  VendorStats,
  PlatformStats,
  CoOccurrence,
  TimelinePoint,
  FunnelStats,
  DashboardStats,
} from "./types.js";

// ── Extractor ───────────────────────────────────────────────────────
export { extractVendorMentions } from "./extractor.js";

// ── Package Map ─────────────────────────────────────────────────────
export { PACKAGE_TO_VENDOR, resolvePackageToVendor } from "./package-map.js";

// ── Normalizer ──────────────────────────────────────────────────────
export { normalizeVendorName } from "./normalizer.js";

// ── Loaders ─────────────────────────────────────────────────────────
export { loadVendorTaxonomy } from "./taxonomy-loader.js";
