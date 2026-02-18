export interface VendorMeta {
  name: string;
  category: string;
  website?: string;
}

// Vendors that have appeared as primary recommendations in benchmark data.
// This list grows automatically — the scorecard pages work with any vendor ID
// from the database, using this map only for display names and metadata.
export const VENDOR_META: Record<string, VendorMeta> = {
  // database
  neon:                     { name: "Neon",                     category: "database",            website: "neon.tech" },
  supabase:                 { name: "Supabase",                 category: "database",            website: "supabase.com" },
  turso:                    { name: "Turso",                    category: "database",            website: "turso.tech" },
  upstash:                  { name: "Upstash",                  category: "database",            website: "upstash.com" },
  planetscale:              { name: "PlanetScale",              category: "database",            website: "planetscale.com" },
  cockroachdb:              { name: "CockroachDB",              category: "database",            website: "cockroachlabs.com" },
  convex:                   { name: "Convex",                   category: "database",            website: "convex.dev" },
  firebase:                 { name: "Firebase",                 category: "database",            website: "firebase.google.com" },

  // observability
  datadog:                  { name: "Datadog",                  category: "observability",       website: "datadoghq.com" },
  honeycomb:                { name: "Honeycomb",                category: "observability",       website: "honeycomb.io" },
  "grafana-cloud":          { name: "Grafana Cloud",            category: "observability",       website: "grafana.com" },
  grafana:                  { name: "Grafana",                  category: "observability",       website: "grafana.com" },
  "new-relic":              { name: "New Relic",                category: "observability",       website: "newrelic.com" },
  axiom:                    { name: "Axiom",                    category: "observability",       website: "axiom.co" },

  // error_monitoring
  sentry:                   { name: "Sentry",                   category: "error_monitoring",    website: "sentry.io" },
  bugsnag:                  { name: "Bugsnag",                  category: "error_monitoring",    website: "bugsnag.com" },
  rollbar:                  { name: "Rollbar",                  category: "error_monitoring",    website: "rollbar.com" },
  highlight:                { name: "Highlight",                category: "error_monitoring",    website: "highlight.io" },

  // feature_flags
  launchdarkly:             { name: "LaunchDarkly",             category: "feature_flags",       website: "launchdarkly.com" },
  statsig:                  { name: "Statsig",                  category: "feature_flags",       website: "statsig.com" },
  flagsmith:                { name: "Flagsmith",                category: "feature_flags",       website: "flagsmith.com" },
  posthog:                  { name: "PostHog",                  category: "feature_flags",       website: "posthog.com" },
  growthbook:               { name: "GrowthBook",               category: "feature_flags",       website: "growthbook.io" },

  // secrets_management
  doppler:                  { name: "Doppler",                  category: "secrets_management",  website: "doppler.com" },
  infisical:                { name: "Infisical",                category: "secrets_management",  website: "infisical.com" },
  "hashicorp-vault":        { name: "HashiCorp Vault",          category: "secrets_management",  website: "vaultproject.io" },
  "aws-secrets-manager":    { name: "AWS Secrets Manager",      category: "secrets_management",  website: "aws.amazon.com" },

  // ci_cd
  "github-actions":         { name: "GitHub Actions",           category: "ci_cd",               website: "github.com/features/actions" },
  turborepo:                { name: "Turborepo",                category: "ci_cd",               website: "turbo.build" },
  dagger:                   { name: "Dagger",                   category: "ci_cd",               website: "dagger.io" },
  earthly:                  { name: "Earthly",                  category: "ci_cd",               website: "earthly.dev" },

  // edge_compute
  "cloudflare-workers":     { name: "Cloudflare Workers",       category: "edge_compute",        website: "workers.cloudflare.com" },
  "vercel-edge-functions":  { name: "Vercel Edge Functions",    category: "edge_compute",        website: "vercel.com" },
  "deno-deploy":            { name: "Deno Deploy",              category: "edge_compute",        website: "deno.com/deploy" },
  "fly-io":                 { name: "Fly.io",                   category: "edge_compute",        website: "fly.io" },
  vercel:                   { name: "Vercel",                   category: "edge_compute",        website: "vercel.com" },

  // developer_portal
  backstage:                { name: "Backstage",                category: "developer_portal",    website: "backstage.io" },
  port:                     { name: "Port",                     category: "developer_portal",    website: "getport.io" },
  cortex:                   { name: "Cortex",                   category: "developer_portal",    website: "cortex.io" },
  opslevel:                 { name: "OpsLevel",                 category: "developer_portal",    website: "opslevel.com" },
  rely:                     { name: "Rely.io",                  category: "developer_portal",    website: "rely.io" },

  // incident_management
  pagerduty:                { name: "PagerDuty",                category: "incident_management", website: "pagerduty.com" },
  "incident-io":            { name: "incident.io",              category: "incident_management", website: "incident.io" },
  firehydrant:              { name: "FireHydrant",              category: "incident_management", website: "firehydrant.com" },
  rootly:                   { name: "Rootly",                   category: "incident_management", website: "rootly.com" },
  opsgenie:                 { name: "Opsgenie",                 category: "incident_management", website: "opsgenie.com" },

  // llm_observability
  langfuse:                 { name: "Langfuse",                 category: "llm_observability",   website: "langfuse.com" },
  langsmith:                { name: "LangSmith",                category: "llm_observability",   website: "smith.langchain.com" },
  braintrust:               { name: "Braintrust",               category: "llm_observability",   website: "braintrustdata.com" },
  helicone:                 { name: "Helicone",                 category: "llm_observability",   website: "helicone.ai" },
  portkey:                  { name: "Portkey",                  category: "llm_observability",   website: "portkey.ai" },
  humanloop:                { name: "Humanloop",                category: "llm_observability",   website: "humanloop.com" },

  // security_scanning
  snyk:                     { name: "Snyk",                     category: "security_scanning",   website: "snyk.io" },
  "github-advanced-security": { name: "GitHub Advanced Security", category: "security_scanning", website: "github.com" },
  semgrep:                  { name: "Semgrep",                  category: "security_scanning",   website: "semgrep.dev" },
  trivy:                    { name: "Trivy",                    category: "security_scanning",   website: "trivy.dev" },
  sonarqube:                { name: "SonarQube",                category: "security_scanning",   website: "sonarqube.org" },

  // agent_dev
  langgraph:                { name: "LangGraph",                category: "agent_dev",           website: "langchain.com" },
  crewai:                   { name: "CrewAI",                   category: "agent_dev",           website: "crewai.com" },
  autogen:                  { name: "AutoGen",                  category: "agent_dev",           website: "microsoft.github.io/autogen" },
  "pydantic-ai":            { name: "Pydantic AI",              category: "agent_dev",           website: "ai.pydantic.dev" },
  "nemo-guardrails":        { name: "NeMo Guardrails",          category: "agent_dev",           website: "nvidia.com" },
  "guardrails-ai":          { name: "Guardrails AI",            category: "agent_dev",           website: "guardrailsai.com" },
};

/** Get display name for a vendor, falling back to the canonical ID */
export function vendorDisplayName(vendorId: string): string {
  return VENDOR_META[vendorId]?.name ?? vendorId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Get the primary category for a vendor */
export function vendorCategory(vendorId: string): string | null {
  return VENDOR_META[vendorId]?.category ?? null;
}
