/**
 * Default category metadata. Used to seed the `categories` table on first run
 * and as fallback display info in the web layer when the DB is unavailable.
 *
 * This is the canonical source of truth for built-in categories. New categories
 * discovered at runtime (e.g. when a vendor doesn't fit any existing category)
 * get auto-created in the DB with generic metadata and can be edited later.
 */
export interface CategoryMeta {
  displayName: string;
  description: string;
  icon: string;
}

export const DEFAULT_CATEGORIES: Record<string, CategoryMeta> = {
  database:            { displayName: "Database",            icon: "🗄", description: "Postgres, serverless DBs, vector search, branching" },
  agent_dev:           { displayName: "Agentic Tooling",     icon: "🤖", description: "AI agent frameworks, orchestration, tool ecosystems" },
  ci_cd:               { displayName: "CI/CD",               icon: "🔄", description: "Build pipelines, deployment automation, preview environments" },
  edge_compute:        { displayName: "Edge Compute",        icon: "⚡", description: "Edge runtimes, serverless functions, CDN compute" },
  error_monitoring:    { displayName: "Error Monitoring",    icon: "🐛", description: "Error tracking, crash reporting, alerting" },
  feature_flags:       { displayName: "Feature Flags",       icon: "🚩", description: "Feature management, A/B testing, rollouts" },
  llm_observability:   { displayName: "LLM Observability",   icon: "🔭", description: "LLM tracing, prompt analytics, cost tracking" },
  observability:       { displayName: "Observability",       icon: "📊", description: "APM, distributed tracing, metrics, logging" },
  secrets_management:  { displayName: "Secrets Management",  icon: "🔑", description: "Secret rotation, env var management, vaults" },
  security_scanning:   { displayName: "Security Scanning",   icon: "🛡", description: "SAST, dependency scanning, container security" },
  developer_portal:    { displayName: "Developer Portal",    icon: "📖", description: "API docs, developer experience, documentation" },
  incident_management: { displayName: "Incident Management", icon: "🚨", description: "On-call, incident response, status pages" },
  code_search:         { displayName: "Code Search",         icon: "🔍", description: "Code search engines, repository indexing" },
  "cross-category":    { displayName: "Cross-Category",      icon: "🔀", description: "Multi-domain prompts spanning several tool categories" },
  other:               { displayName: "Other",               icon: "📦", description: "Vendors that don't fit into a specific category" },
};
