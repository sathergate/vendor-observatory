import { getCategoryMeta } from "@/lib/db";

export interface CategoryMetaEntry {
  label: string;
  icon: string;
  description: string;
}

/**
 * Hardcoded fallback — used only when the DB is unavailable.
 * The DB's `categories` table is the source of truth; this ensures
 * the UI still renders when DATABASE_URL is not set.
 */
export const CATEGORY_META_FALLBACK: Record<string, CategoryMetaEntry> = {
  database:            { label: "Database",            icon: "\u{1F5C4}", description: "Postgres, serverless DBs, vector search, branching" },
  agent_dev:           { label: "Agentic Tooling",     icon: "\u{1F916}", description: "AI agent frameworks, orchestration, tool ecosystems" },
  ci_cd:               { label: "CI/CD",               icon: "\u{1F504}", description: "Build pipelines, deployment automation, preview environments" },
  edge_compute:        { label: "Edge Compute",        icon: "\u26A1",    description: "Edge runtimes, serverless functions, CDN compute" },
  error_monitoring:    { label: "Error Monitoring",    icon: "\u{1F41B}", description: "Error tracking, crash reporting, alerting" },
  feature_flags:       { label: "Feature Flags",       icon: "\u{1F6A9}", description: "Feature management, A/B testing, rollouts" },
  llm_observability:   { label: "LLM Observability",   icon: "\u{1F52D}", description: "LLM tracing, prompt analytics, cost tracking" },
  observability:       { label: "Observability",       icon: "\u{1F4CA}", description: "APM, distributed tracing, metrics, logging" },
  secrets_management:  { label: "Secrets Management",  icon: "\u{1F511}", description: "Secret rotation, env var management, vaults" },
  security_scanning:   { label: "Security Scanning",   icon: "\u{1F6E1}", description: "SAST, dependency scanning, container security" },
  developer_portal:    { label: "Developer Portal",    icon: "\u{1F4D6}", description: "API docs, developer experience, documentation" },
  incident_management: { label: "Incident Management", icon: "\u{1F6A8}", description: "On-call, incident response, status pages" },
  code_search:         { label: "Code Search",         icon: "\u{1F50D}", description: "Code search engines, repository indexing" },
  "cross-category":    { label: "Cross-Category",      icon: "\u{1F500}", description: "Multi-domain prompts spanning several tool categories" },
  other:               { label: "Other",               icon: "\u{1F4E6}", description: "Vendors that don't fit into a specific category" },
};

/**
 * Fetch the canonical category list from the database. Any categories in the
 * DB that don't have a fallback entry are included as-is. Falls back to the
 * hardcoded defaults when the DB is unavailable.
 */
export async function loadCategoryMeta(): Promise<Record<string, CategoryMetaEntry>> {
  const dbRows = await getCategoryMeta();

  if (dbRows.length === 0) {
    // DB unavailable or categories table not seeded yet — use fallback
    return { ...CATEGORY_META_FALLBACK };
  }

  const result: Record<string, CategoryMetaEntry> = {};

  // Start with DB rows as the source of truth
  for (const row of dbRows) {
    result[row.id] = {
      label: row.display_name,
      icon: row.icon,
      description: row.description,
    };
  }

  // Merge any fallback entries not already in the DB (defensive)
  for (const [id, meta] of Object.entries(CATEGORY_META_FALLBACK)) {
    if (!result[id]) {
      result[id] = meta;
    }
  }

  return result;
}

// Re-export the old name for backward compatibility with any code that
// does a synchronous import. This is the static fallback only.
export const CATEGORY_META = CATEGORY_META_FALLBACK;
