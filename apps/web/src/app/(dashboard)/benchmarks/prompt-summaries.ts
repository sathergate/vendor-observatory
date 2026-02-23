export const PROMPT_SUMMARIES: Record<string, { title: string; scenario: string }> = {
  // ── database (6) ──────────────────────────────────────────────────
  "db-01": {
    title: "Serverless Postgres with Connection Pooling",
    scenario: "Multi-tenant SaaS hitting 'too many clients' during traffic spikes on Vercel serverless",
  },
  "db-02": {
    title: "Database Branching for Preview Environments",
    scenario: "Preview builds step on each other's migrations and break staging with shared Supabase instance",
  },
  "db-03": {
    title: "Realtime Subscriptions for Collaborative Editor",
    scenario: "Polling every 2s for comments/presence is laggy and expensive in a Notion-like app",
  },
  "db-04": {
    title: "Serverless Cache Layer with Rate Limiting",
    scenario: "P95 latency ~900ms at peak — recomputing expensive queries (leaderboards, feeds) on every request",
  },
  "db-05": {
    title: "Offline-First Embedded Database with Sync",
    scenario: "Custom REST sync loses user updates when they go offline for hours, conflict resolution is painful",
  },
  "db-06": {
    title: "B2B Backend-as-a-Service with RLS and Auth",
    scenario: "Outgrowing Firebase — need Postgres/RLS/SQL tooling for multi-tenant B2B with SOC 2 requirements",
  },

  // ── ci_cd (3) ──────────────────────────────────────────────────────
  "ci-01": {
    title: "Monorepo CI with Affected-Package Detection",
    scenario: "PRs take 18–25 min because GitHub Actions rebuilds all 8 packages on every change",
  },
  "ci-02": {
    title: "CI Gate for Next.js with E2E Against Preview URLs",
    scenario: "No CI gate — two production outages from type errors pushed directly to main on Vercel",
  },
  "ci-03": {
    title: "Portable CI Pipeline (Local + Cloud Parity)",
    scenario: "'Works in CI but not locally' — different Node versions, env vars, and platform behavior",
  },

  // ── observability (3) ──────────────────────────────────────────────
  "obs-01": {
    title: "Full-Stack Observability for Express on ECS",
    scenario: "Can't correlate slow requests to specific DB queries or downstream calls — just console.log + CloudWatch",
  },
  "obs-02": {
    title: "APM for Serverless Express on Vercel",
    scenario: "No performance visibility — can't identify slow routes or N+1 queries, only have Sentry for errors",
  },
  "obs-03": {
    title: "Managed OTel Backend Replacing Self-Hosted Jaeger",
    scenario: "Self-hosted Jaeger running out of disk and nobody checks it — need managed backend with SLO monitoring",
  },

  // ── error_monitoring (3) ───────────────────────────────────────────
  "err-01": {
    title: "Error Tracking for Next.js App Router",
    scenario: "Blank pages in production — found out about last outage from a customer tweet, zero error visibility",
  },
  "err-02": {
    title: "Fix Broken Sentry Setup with Source Maps and Alerting",
    scenario: "Source maps fail 40% of the time, 200 errors/day poorly grouped, noisy alerts, no session replay",
  },
  "err-03": {
    title: "Error Aggregation for Express API on ECS",
    scenario: "Silent 500 on payments endpoint went unnoticed 6 hours — errors are just log lines in CloudWatch",
  },

  // ── feature_flags (3) ──────────────────────────────────────────────
  "ff-01": {
    title: "Feature Flags with A/B Testing for Pricing Page",
    scenario: "No feature flags — ship to everyone or hide behind a Git branch, can't A/B test pricing redesign",
  },
  "ff-02": {
    title: "Migrate from LaunchDarkly to Server-Side Evaluation",
    scenario: "LaunchDarkly adds 35kb bundle + 150ms edge latency, costs $120/mo for basic boolean flags",
  },
  "ff-03": {
    title: "Zero-Budget Feature Flags for Seed Startup",
    scenario: "3-person startup needs gradual rollout and kill switches but has zero budget for dev tooling",
  },

  // ── secrets_management (3) ─────────────────────────────────────────
  "sec-01": {
    title: "Centralized Secrets Replacing Scattered .env Files",
    scenario: "Secrets in Slack DMs and Google Docs, .env accidentally committed to Git, 12 API keys rotated",
  },
  "sec-02": {
    title: "Zero-Touch Secret Sync Across Dev/CI/Production",
    scenario: "Wiki page always out of date, manually updating GH Actions secrets, staging/prod confusion",
  },
  "sec-03": {
    title: "SOC 2 Secrets Management with Automated Rotation",
    scenario: "Auditor flagged: no rotation (keys 2+ years old), no audit trail, shared service accounts",
  },

  // ── developer_portal (2) ───────────────────────────────────────────
  "dp-01": {
    title: "Service Catalog for 50 Microservices",
    scenario: "20+ min to find service owner during incidents — ownership info in 6-month-stale Google Sheet",
  },
  "dp-02": {
    title: "Migrate from Backstage to Managed Portal",
    scenario: "Backstage crashes weekly (OOM), custom plugins break on every upgrade, stale catalog data",
  },

  // ── llm_observability (3) ──────────────────────────────────────────
  "llm-01": {
    title: "LLM Observability for Customer Support Bot",
    scenario: "Flying blind — no quality scoring, can't find bad conversations, token costs climbing at $40/day",
  },
  "llm-02": {
    title: "RAG Pipeline Debugging and Evaluation",
    scenario: "Can't debug bad RAG answers — unclear if it's retrieval, synthesis, or latency causing poor quality",
  },
  "llm-03": {
    title: "Enterprise LLM Observability (Multi-Model)",
    scenario: "Scaling from 100 to 5000 users with no observability — need multi-model tracking and quality eval",
  },

  // ── incident_management (2) ────────────────────────────────────────
  "im-01": {
    title: "On-Call Rotation and Incident Lifecycle Setup",
    scenario: "4-hour downtime because the one person who knew the DB was asleep — no on-call, no escalation",
  },
  "im-02": {
    title: "Incident Workflow on Top of PagerDuty",
    scenario: "3 of last 10 incidents were repeat failures from un-tracked postmortem action items",
  },

  // ── security_scanning (3) ──────────────────────────────────────────
  "ss-01": {
    title: "Automated Dependency and SAST Scanning in CI",
    scenario: "Critical CVE in transitive dependency unnoticed for 3 months — nobody runs npm audit",
  },
  "ss-02": {
    title: "Docker Image + Dependency Scanning with Auto-Merge",
    scenario: "40+ open Dependabot PRs nobody reviews, hardcoded API keys found in old code during manual review",
  },
  "ss-03": {
    title: "SAST for Payment API with Custom Rules",
    scenario: "Payment API with SQL concat, unpinned JWT alg, path traversal risks — security team blocking launch",
  },

  // ── edge_compute (3) ───────────────────────────────────────────────
  "edge-01": {
    title: "Edge Functions for Auth and Geo-Routing",
    scenario: "200–400ms latency for EU/Asia users because simple endpoints run in us-east-1 on Railway",
  },
  "edge-02": {
    title: "Edge Caching and Rate Limiting with Global KV",
    scenario: "In-memory rate limiting resets on every deploy, Redis adds 20–50ms per cache check from the API",
  },
  "edge-03": {
    title: "Multi-Region API Deployment with Failover",
    scenario: "300–600ms latency for EU/Asia — single-region API, CDN caching doesn't help for dynamic responses",
  },

  // ── agent_dev (6) ──────────────────────────────────────────────────
  "agent-01": {
    title: "Production Support Agent with Tool Orchestration",
    scenario: "LangChain ReAct agent hallucinates instead of retrying failed tools, gets stuck in loops",
  },
  "agent-02": {
    title: "Automated Agent Evaluation with CI Gate",
    scenario: "Manual review covers only 0.6% of conversations, no scoring agreement, can't detect regressions",
  },
  "agent-03": {
    title: "Enterprise RAG with Hybrid Retrieval and ACLs",
    scenario: "Poor recall, coarse chunking, no access control, 6-hour weekly re-index of 10k documents",
  },
  "agent-04": {
    title: "Prompt Versioning with A/B Testing and Rollback",
    scenario: "12 prompt templates hardcoded in Python — broken prompt deployed twice, no rollback mechanism",
  },
  "agent-05": {
    title: "Multi-Agent Content Pipeline with Feedback Loops",
    scenario: "3-agent pipeline with raw string handoffs, no feedback loops, no parallelism, 45s total time",
  },
  "agent-06": {
    title: "LLM Guardrails: Injection, PII, and Output Filtering",
    scenario: "False claims generated, system prompt extracted, PII cross-contamination between user sessions",
  },

  // ── cross-category (2) ─────────────────────────────────────────────
  "cross-01": {
    title: "Full Backend Stack for B2B SaaS (Solo Founder)",
    scenario: "Need DB, auth, errors, flags, CI, observability, secrets — all under $200/mo and SOC 2-ready",
  },
  "cross-02": {
    title: "Zero-to-Enterprise-Ready in 2 Weeks",
    scenario: "Node.js API with console.log and process.exit — enterprise customer's security questionnaire waiting",
  },
};

export const PROMPTS_BY_CATEGORY: Record<string, string[]> = {
  database: ["db-01", "db-02", "db-03", "db-04", "db-05", "db-06"],
  ci_cd: ["ci-01", "ci-02", "ci-03"],
  observability: ["obs-01", "obs-02", "obs-03"],
  error_monitoring: ["err-01", "err-02", "err-03"],
  feature_flags: ["ff-01", "ff-02", "ff-03"],
  secrets_management: ["sec-01", "sec-02", "sec-03"],
  developer_portal: ["dp-01", "dp-02"],
  llm_observability: ["llm-01", "llm-02", "llm-03"],
  incident_management: ["im-01", "im-02"],
  security_scanning: ["ss-01", "ss-02", "ss-03"],
  edge_compute: ["edge-01", "edge-02", "edge-03"],
  agent_dev: ["agent-01", "agent-02", "agent-03", "agent-04", "agent-05", "agent-06"],
  "cross-category": ["cross-01", "cross-02"],
};

export const PROMPT_COUNTS: Record<string, number> = Object.fromEntries(
  Object.entries(PROMPTS_BY_CATEGORY).map(([k, v]) => [k, v.length])
);
