import { loadPromptsByKind, hasPrompts } from "@obs/shared";
import type { PromptRow } from "@obs/shared";

/** Minimal pool interface — avoids hard dependency on `pg`. */
interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export type TemplateType = "node-api" | "next-app" | "python-api";

// ── Enrichment Dimensions ─────────────────────────────────────────────
// Content enrichment (what context is in the prompt)
export type ContentTag =
  | "existing_system"       // 1: existing stack + failure mode
  | "compliance_security"   // 2: SOC2/HIPAA/GDPR, residency, encryption, audit
  | "workload_shape"        // 3: RPS, concurrency, read/write mix, burstiness
  | "ecosystem_coupling"    // 4: framework, ORM, hosting, CI/preview env
  | "compatibility";        // 5: true Postgres vs wire-compat, extensions, dialect

// Prompt pattern (how the prompt is structured)
export type PatternTag =
  | "pain_point"            // A: starts from concrete production/dev pain
  | "constraint_driven"     // B: leads with non-negotiables
  | "workload_driven"       // C: specifies traffic/data shape
  | "llm_era"              // D: embeddings, vector, hybrid transactional+vector
  | "existing_vendor";      // E: already using X, asks for setup/migration

export interface PromptMetadata {
  contentTags: ContentTag[];
  patternTags: PatternTag[];
  constraints: string[];
  existingStack: string[];
  failureMode: string | null;
  vendorsNamedInPrompt: string[];
}

export interface BenchmarkPrompt {
  id: string;
  category: string;
  template: TemplateType;
  text: string;
  metadata: PromptMetadata;
}

export const BENCHMARK_PROMPTS: BenchmarkPrompt[] = [
  // ── database (6) ──────────────────────────────────────────────────
  {
    id: "db-01",
    category: "database",
    template: "next-app",
    text: `I'm building a multi-tenant SaaS on Next.js 14 (App Router) deployed to Vercel. We use Prisma.
Today we're on a small AWS RDS Postgres instance and we regularly hit "too many clients already" during
traffic spikes and in Vercel preview deployments (each serverless invocation opens connections).
Requirements:
- Must behave well with serverless (pooling and/or an HTTP driver; avoid connection storms).
- We need pgvector (we store embeddings for semantic search) and we rely on common Postgres extensions.
- EU customer data must stay in the EU (data residency). We also want PITR backups.
- Expected load: bursty ~150–300 RPS peak, ~95% reads; multi-tenant.
Compare Neon vs Supabase vs Aurora Serverless v2 vs CockroachDB (and any other serious options).
Recommend one, explicitly call out any "Postgres-compatible but not actually Postgres" gotchas, and then
show the exact Next.js + Prisma setup (env vars, pooling settings, and how to avoid connection storms
across serverless + preview environments).`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven", "llm_era"],
      constraints: ["serverless_compatible", "pgvector_required", "eu_data_residency", "pitr_backups"],
      existingStack: ["aws_rds_postgres", "nextjs_14", "prisma", "vercel"],
      failureMode: "connection storms — too many clients already",
      vendorsNamedInPrompt: ["neon", "supabase", "aurora-serverless", "cockroachdb"],
    },
  },
  {
    id: "db-02",
    category: "database",
    template: "next-app",
    text: `We ship a Vercel preview environment for every PR, but our current setup is brittle:
- We use a single shared Supabase Postgres instance for dev/staging.
- Preview builds step on each other's migrations and test data, and occasionally break staging.
- We want isolated DB state per PR (branching or an equivalent workflow) with fast create/destroy.
Stack/constraints:
- Next.js + Drizzle migrations (open to Prisma if that's materially better for branching workflows).
- Prefer "real Postgres" because we use Postgres-specific features (RLS/extension support).
- We need a clean path to production (staging/prod separation, PITR, no weekend-long migration dramas).
Recommend the best approach/vendor (Neon branching? Supabase projects per env? PlanetScale despite MySQL?
something else). Then give a concrete setup plan:
- create a DB branch per PR in CI
- run migrations safely (no cross-branch collisions)
- minimal seeding strategy
- teardown on merge/close`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "workload_driven", "existing_vendor"],
      constraints: ["branch_per_pr", "real_postgres", "staging_prod_separation", "pitr"],
      existingStack: ["supabase", "vercel", "nextjs", "drizzle"],
      failureMode: "preview builds step on each other's migrations, break staging",
      vendorsNamedInPrompt: ["supabase", "neon", "planetscale"],
    },
  },
  {
    id: "db-03",
    category: "database",
    template: "node-api",
    text: `I'm building a collaborative editor (Notion-lite) with Next.js + React.
Current pain: we do Postgres + polling every 2s for comments/metadata and it's laggy + expensive.
We already use Yjs for CRDT doc state; now we need realtime presence, notifications, and live queries for:
- comments
- per-doc permissions changes
- "who's online" presence indicators
Requirements/constraints:
- Peak ~10k concurrent websocket clients; updates fan out to ~10–50 viewers per doc.
- Strong multi-tenant isolation (RLS-like), plus audit logs (enterprise asks).
- Some customers require US-only data residency.
- Prefer not to rewrite everything to a totally different data model unless necessary (we're SQL-centric).
Which backends support realtime subscriptions/live queries (Supabase Realtime, Convex, Firebase Firestore,
Appwrite, etc.)? Recommend one based on scale, security model, and DX, and outline how you'd set up:
- auth integration
- table/data model for comments + notifications
- realtime channels / subscription patterns
- a safe authorization model (tenant isolation)`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["realtime_websockets", "multi_tenant_rls", "audit_logs", "us_data_residency", "sql_data_model"],
      existingStack: ["postgres", "nextjs", "react", "yjs"],
      failureMode: "polling every 2s — laggy and expensive",
      vendorsNamedInPrompt: ["supabase", "convex", "firebase", "appwrite"],
    },
  },
  {
    id: "db-04",
    category: "database",
    template: "node-api",
    text: `We have a Next.js API (Route Handlers) on Vercel hitting Postgres. P95 is ~900ms at peak because we
recompute the same expensive queries (leaderboards + personalized feed) and we also need rate limiting.
We already use Redis semantics in code (atomic INCR, TTL, and a couple Lua scripts), but we don't want
to run/operate Redis ourselves.
Constraints:
- Works from serverless (and ideally edge-compatible patterns where possible).
- Global users (US/EU); we want low latency and predictable costs under bursty load (~200 RPS peak).
- We cannot cache PII in plaintext.
Recommend a managed serverless cache (Upstash Redis or credible alternatives) and explain tradeoffs.
Then show exactly how to integrate it:
- caching layer for 2 endpoints (feed + leaderboard) with tenant-safe cache keys
- TTL + invalidation strategy
- a rate-limit middleware using atomic ops
- guidance on handling secrets and avoiding accidental PII caching`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven", "existing_vendor"],
      constraints: ["serverless_compatible", "edge_compatible", "no_pii_in_cache", "predictable_cost", "redis_api_compat"],
      existingStack: ["nextjs", "vercel", "postgres", "redis_semantics"],
      failureMode: "P95 ~900ms at peak — recomputing expensive queries",
      vendorsNamedInPrompt: ["upstash"],
    },
  },
  {
    id: "db-05",
    category: "database",
    template: "node-api",
    text: `I'm building an offline-first field-service app: mobile (React Native/Expo) + a web dashboard.
We currently use SQLite locally and a custom REST-based sync, but conflict resolution is painful and
users lose updates when they go offline for hours.
Requirements:
- Embedded database in the client for local reads/writes (SQL is preferred).
- Robust sync to the cloud with conflict handling (multi-tenant data + per-user ACLs).
- Some edge compute (validate rules near users).
- Optional on-device semantic search for notes (embeddings) for a "local RAG" feature.
Constraints:
- Data must be encrypted on device; some customers ask about HIPAA-like handling.
- ~50k users eventually, but each user only syncs a few MB/day; spotty connectivity is normal.
Compare Turso/libSQL vs ElectricSQL + PGlite (and any other serious options).
Recommend one and be explicit about consistency/conflict semantics, then give a concrete setup plan:
- local schema + migration flow
- sync topology to a cloud Postgres (or equivalent)
- encryption + tenant authorization model
- how/where to store embeddings and query them locally vs in the cloud`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven", "llm_era"],
      constraints: ["offline_first", "embedded_sql", "conflict_resolution", "encryption_at_rest", "hipaa_adjacent", "edge_compute"],
      existingStack: ["sqlite", "react_native", "expo", "custom_rest_sync"],
      failureMode: "conflict resolution painful, users lose updates offline",
      vendorsNamedInPrompt: ["turso", "electricsql", "pglite"],
    },
  },
  {
    id: "db-06",
    category: "database",
    template: "next-app",
    text: `We're building a B2B SaaS with strict multi-tenancy. We want a backend-as-a-service that gives:
- auth (email magic link + OAuth)
- Postgres with row-level security
- realtime subscriptions for in-app notifications
- audit logs
Context/pain:
- We used Firebase before and it was fast to start, but we want Postgres/RLS + SQL tooling now.
Constraints:
- We're pursuing SOC 2; some customers require EU data residency.
- We need staging/prod separation, and a clear escape hatch if we outgrow the BaaS later.
- Stack is Next.js; we care about DX and a sane local dev story.
Recommend a platform (Supabase or credible alternatives), then show how to set it up end-to-end:
- project structure across dev/staging/prod
- auth integration with Next.js (session handling, server/client usage)
- example tables for a multi-tenant model
- sample RLS policies enforcing tenant isolation
- a realtime subscription pattern for notifications
- what the "escape hatch" migration path looks like if we need more custom infra later`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven", "existing_vendor"],
      constraints: ["soc2", "eu_data_residency", "staging_prod_separation", "escape_hatch", "multi_tenant_rls", "audit_logs"],
      existingStack: ["firebase", "nextjs"],
      failureMode: "Firebase lacks Postgres/RLS/SQL tooling for B2B needs",
      vendorsNamedInPrompt: ["supabase", "firebase"],
    },
  },

  // ── ci_cd (3) ──────────────────────────────────────────────────────
  {
    id: "ci-01",
    category: "ci_cd",
    template: "node-api",
    text: `We have a Node.js monorepo (pnpm workspaces, ~8 packages) deployed to AWS via CDK. Our current CI
is a hand-rolled set of bash scripts in GitHub Actions that re-run everything on every PR — full install,
full build, full test — even when only one package changed. PRs take 18–25 minutes.
Requirements:
- Affected-package detection: only lint/test/build packages that changed (or depend on changes).
- Caching: node_modules, build artifacts, Docker layers.
- Deploy to staging on merge to main, production on release tag.
- We need secrets (AWS creds, npm token) injected securely — no .env files checked in.
Constraints:
- Must stay on GitHub Actions (company policy).
- Some packages produce Docker images pushed to ECR; others are pure npm libraries.
- We want the CI config maintainable — not 500 lines of YAML per workflow.
Set up CI/CD with affected-package detection (Turborepo, Nx, or changesets — recommend one),
proper caching, and a deploy pipeline. Show the actual workflow YAML and explain how a PR
that touches only packages/api would skip building packages/web.`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "existing_vendor"],
      constraints: ["github_actions_only", "monorepo", "affected_package_detection", "docker_ecr", "secure_secrets"],
      existingStack: ["github_actions", "pnpm_workspaces", "aws_cdk", "docker", "ecr"],
      failureMode: "PRs take 18-25 minutes — full rebuild on every change",
      vendorsNamedInPrompt: ["github-actions", "turborepo", "nx"],
    },
  },
  {
    id: "ci-02",
    category: "ci_cd",
    template: "next-app",
    text: `I have a Next.js 14 app deployed to Vercel. Vercel handles production deploys, but I need a
proper CI gate on PRs before merge: lint, type-check, unit tests (Vitest), and E2E tests (Playwright).
Current pain: we have no CI — developers push to main and Vercel deploys whatever lands. We've had
two production outages from type errors that would've been caught by tsc.
Constraints:
- Vercel handles deploy; CI only needs to run checks (no duplicate deploy step).
- E2E tests need a preview URL — Vercel generates one per PR, but we need CI to wait for it.
- We want Slack notifications on failure, and PR checks must block merge.
- Budget-conscious: prefer GitHub Actions free tier; E2E should run only on non-draft PRs.
Set up the full CI pipeline. Show how to:
- trigger on PR open/sync, skip on draft
- run lint + tsc + vitest in parallel
- wait for the Vercel preview deploy, then run Playwright against it
- report results as GitHub PR checks (not just logs)
- send Slack notification on failure`,
    metadata: {
      contentTags: ["existing_system", "ecosystem_coupling", "workload_shape"],
      patternTags: ["pain_point", "constraint_driven", "existing_vendor"],
      constraints: ["vercel_deploys", "github_actions_free_tier", "e2e_against_preview", "slack_notifications", "block_merge"],
      existingStack: ["nextjs_14", "vercel", "vitest", "playwright"],
      failureMode: "no CI gate — production outages from type errors pushed to main",
      vendorsNamedInPrompt: ["vercel", "github-actions"],
    },
  },
  {
    id: "ci-03",
    category: "ci_cd",
    template: "node-api",
    text: `I want my CI pipeline to run identically on my laptop and in the cloud. We've been burned by
"works in CI but not locally" and vice versa — different Node versions, different env vars, flaky
platform-specific behavior.
Current stack: Node.js API with Docker for production, GitHub Actions for CI.
Requirements:
- A single pipeline definition that runs the same steps locally (make ci or equivalent) and in GH Actions.
- Containerized steps so Node version, OS deps, and tools are pinned.
- Must support running integration tests against a Postgres container (docker-compose or similar).
- Pipeline should be fast locally (~2 min) and cacheable in CI.
Constraints:
- Team uses both Mac (ARM) and Linux; pipeline must work on both.
- We don't want to adopt a whole new CI platform — keep GitHub Actions as the runner, but make the
  pipeline definition portable.
Compare Dagger, Earthly, Taskfile + Docker Compose, and Makefile + Act. Recommend one, then set up:
- the pipeline definition file
- local invocation (one command)
- GitHub Actions workflow that calls the same pipeline
- integration test step with Postgres`,
    metadata: {
      contentTags: ["existing_system", "ecosystem_coupling", "compatibility", "workload_shape"],
      patternTags: ["pain_point", "constraint_driven", "existing_vendor"],
      constraints: ["local_ci_parity", "containerized_steps", "multi_arch", "postgres_integration_tests", "github_actions_runner"],
      existingStack: ["github_actions", "docker", "nodejs", "postgres"],
      failureMode: "works in CI but not locally — different Node versions, env vars, platform behavior",
      vendorsNamedInPrompt: ["dagger", "earthly", "github-actions"],
    },
  },

  // ── observability (3) ──────────────────────────────────────────────
  {
    id: "obs-01",
    category: "observability",
    template: "node-api",
    text: `We have a Node.js Express API (~40 routes) running on ECS Fargate behind an ALB. Currently we
just use console.log and CloudWatch, but debugging production issues is painful — we can't correlate
a slow request to the specific DB query or downstream HTTP call that caused it.
Requirements:
- Structured JSON logging (replace console.log) with request-id correlation across all log lines.
- Distributed tracing: see the full request waterfall (Express → Postgres → Redis → external API).
- Metrics: request rate, error rate, latency percentiles (p50/p95/p99) per route.
- Alerting: Slack notification when error rate > 5% or p99 > 2s for any route.
Constraints:
- Running on AWS (ECS Fargate) — can use CloudWatch, X-Ray, or third-party.
- Team of 5 — don't want to operate Prometheus/Grafana/Jaeger ourselves.
- Budget: prefer a managed platform with a meaningful free tier; we do ~10M requests/month.
Compare Datadog vs Honeycomb vs Grafana Cloud vs New Relic vs AWS-native (X-Ray + CloudWatch).
Recommend one stack, then show the actual integration:
- structured logger setup (pino or winston with request-id injection)
- OpenTelemetry auto-instrumentation for Express + pg + ioredis
- exporter config to the chosen backend
- a sample alert/SLO definition`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven", "existing_vendor"],
      constraints: ["managed_platform", "free_tier", "aws_compatible", "slack_alerting", "small_team"],
      existingStack: ["express", "ecs_fargate", "cloudwatch", "postgres", "redis", "alb"],
      failureMode: "can't correlate slow requests to specific DB queries or downstream calls",
      vendorsNamedInPrompt: ["datadog", "honeycomb", "grafana-cloud", "new-relic", "aws-xray"],
    },
  },
  {
    id: "obs-02",
    category: "observability",
    template: "node-api",
    text: `We run an Express API on Vercel serverless functions. We added Sentry for errors but we have
no visibility into performance — we don't know which routes are slow, which DB queries are the bottleneck,
or how latency breaks down across middleware. We also suspect some routes have N+1 query problems but
can't prove it without tracing.
Requirements:
- APM with request-level tracing: see each middleware, DB query, and external HTTP call as spans.
- Auto-instrumentation — I don't want to manually wrap every route and query.
- Latency breakdown dashboards: p50/p95/p99 per route, slow query identification.
- Custom metrics: track business events (signups, purchases) alongside infra metrics.
Constraints:
- Serverless on Vercel — no long-running daemon, must work with short-lived function invocations.
- Already using Sentry for errors — prefer something that integrates or replaces it cleanly.
- Need to keep bundle size reasonable (serverless cold starts matter).
Recommend an APM solution that works well in serverless. Show the setup:
- OpenTelemetry or vendor-native instrumentation
- auto-instrument Express, Prisma/pg, and fetch
- export to the chosen backend
- a dashboard or query that identifies N+1 patterns`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "existing_vendor", "constraint_driven"],
      constraints: ["serverless_compatible", "auto_instrumentation", "small_bundle_size", "sentry_integration"],
      existingStack: ["express", "vercel", "sentry", "prisma"],
      failureMode: "no performance visibility — can't identify slow routes or N+1 queries",
      vendorsNamedInPrompt: ["sentry"],
    },
  },
  {
    id: "obs-03",
    category: "observability",
    template: "node-api",
    text: `We're adopting OpenTelemetry across our Node.js services (3 services, Express + Fastify mix).
We have auto-instrumentation partially working but traces are going to a local Jaeger instance that
nobody checks and that keeps running out of disk.
Requirements:
- Replace self-hosted Jaeger with a managed backend that has good search, trace analytics, and retention.
- Keep OTel as the instrumentation layer (vendor-neutral); just change the exporter.
- Need a good free tier — we generate ~5M spans/month across the 3 services.
- Want SLO monitoring: define latency/error SLOs per service and get alerted on burn rate.
Constraints:
- Must support OTLP/gRPC export (native OTel protocol, not vendor-specific agents).
- Team is 4 engineers; we need something with good query UX, not just raw trace storage.
- Some traces contain PII in attributes — need a way to scrub or redact before export.
Compare Honeycomb vs Grafana Cloud (Tempo) vs Axiom vs Datadog vs Lightstep/ServiceNow.
Recommend one, then show:
- OTel collector config (or direct SDK export) with OTLP/gRPC to the chosen backend
- attribute scrubbing/redaction pipeline for PII
- an SLO definition (latency + availability) with burn-rate alerting
- migration plan from Jaeger (what to change, what to keep)`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven", "existing_vendor"],
      constraints: ["otlp_grpc_export", "pii_scrubbing", "free_tier_5m_spans", "slo_monitoring", "vendor_neutral"],
      existingStack: ["opentelemetry", "jaeger", "express", "fastify"],
      failureMode: "self-hosted Jaeger running out of disk, nobody checks it",
      vendorsNamedInPrompt: ["honeycomb", "grafana-cloud", "axiom", "datadog", "lightstep"],
    },
  },

  // ── error_monitoring (3) ───────────────────────────────────────────
  {
    id: "err-01",
    category: "error_monitoring",
    template: "next-app",
    text: `We have a Next.js 14 app (App Router) on Vercel. We're getting occasional blank pages in production
and user complaints about "something went wrong" but we have zero visibility into what's happening —
no error tracking, no source maps, no alerting. We found out about the last outage from a customer tweet.
Requirements:
- Catch unhandled exceptions in both client React components and server-side (API routes, server components, middleware).
- Source map support so stack traces show original TypeScript, not minified bundles.
- User context: attach user ID and session to errors so we can see who's affected.
- Alerting: Slack notification for new error groups; PagerDuty for error spike > 10x baseline.
Constraints:
- Next.js 14 App Router + Turbopack (some error SDKs don't support RSC/server components well yet).
- Vercel deployment — need build-time source map upload, not runtime.
- We want session replay for client errors (reproduce what the user saw).
- Free tier or <$30/mo to start; we have ~50k MAU.
Recommend the best error tracking tool for this stack. Show the full setup:
- SDK initialization for client, server components, API routes, and middleware
- source map upload in the Vercel build step
- user context enrichment
- alert configuration
- how to test that errors are actually captured (a deliberate test error)`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["nextjs_app_router", "source_maps", "session_replay", "slack_pagerduty_alerts", "budget_30mo"],
      existingStack: ["nextjs_14", "vercel", "turbopack"],
      failureMode: "blank pages in production — found out from customer tweet, zero visibility",
      vendorsNamedInPrompt: [],
    },
  },
  {
    id: "err-02",
    category: "error_monitoring",
    template: "next-app",
    text: `We use Sentry for error tracking in our Next.js app but the setup is half-broken:
- Source maps upload fails intermittently in CI (Vercel build), so 40% of errors show minified traces.
- We get ~200 error events/day but they're not well grouped — the same error shows as 15 separate issues.
- We never set up session replay or performance monitoring, so when users report "it's slow" we can't
  reproduce what happened.
- Slack alerts fire for every new issue, including noise (hydration mismatches, ad-blocker errors).
Requirements:
- Fix the source map pipeline so 100% of errors have readable stack traces.
- Tune error grouping (fingerprinting rules) to reduce noise.
- Add session replay for error events (not all sessions — too expensive).
- Set up performance monitoring with Web Vitals tracking.
- Smart alerting: only alert on genuinely new regressions, not recurring noise.
Constraints:
- We're already on Sentry (Team plan) — prefer to fix what we have rather than migrate, unless
  there's a compelling reason to switch. If you'd recommend switching, say why.
- Next.js 14 App Router on Vercel.
Show how to fix/improve the current Sentry setup, or recommend a better alternative:
- reliable source map upload in the Vercel build pipeline
- custom fingerprinting rules for common Next.js error patterns
- session replay configuration (error-only sampling)
- performance/Web Vitals monitoring setup
- alert rules that distinguish regressions from known noise`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "existing_vendor", "constraint_driven"],
      constraints: ["source_maps_reliability", "error_grouping", "session_replay_sampling", "smart_alerting", "web_vitals"],
      existingStack: ["sentry", "nextjs_14", "vercel"],
      failureMode: "source maps fail 40% of time, noisy alerts, can't reproduce user-reported slowness",
      vendorsNamedInPrompt: ["sentry"],
    },
  },
  {
    id: "err-03",
    category: "error_monitoring",
    template: "node-api",
    text: `We run a Node.js API (Express) on ECS with ~30 routes. We catch errors in a global middleware
and log them, but we have no aggregation — each error is a log line in CloudWatch. When something breaks,
we grep logs and manually count how many users were affected. Last week a silent 500 on the payments
endpoint went unnoticed for 6 hours.
Requirements:
- Automatic error aggregation and grouping (group by stack trace, not just message).
- Release tracking: see when a new deploy introduces regressions.
- User impact: know how many unique users hit each error, with user context attached.
- Alerting: immediate Slack alert for new error groups; escalation if error rate crosses threshold.
- Generous free tier — we're a 6-person startup doing ~2M requests/month.
Constraints:
- Running on AWS ECS (Fargate) — need a lightweight SDK, not a heavy agent.
- Must work with our Express error middleware pattern (we catch errors centrally, not per-route).
- We deploy 3–5 times/day; release tracking must be automated (not manual "create release" steps).
Compare Sentry vs Bugsnag vs Rollbar vs Highlight.io. Recommend one, then show the setup:
- Express error middleware integration
- automatic release creation tied to deploy (ECS task definition revision or git SHA)
- user context enrichment
- alert rules for new regressions vs known issues`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["lightweight_sdk", "automated_release_tracking", "express_middleware", "free_tier", "ecs_fargate"],
      existingStack: ["express", "ecs_fargate", "cloudwatch"],
      failureMode: "silent 500 on payments endpoint unnoticed for 6 hours — no aggregation",
      vendorsNamedInPrompt: ["sentry", "bugsnag", "rollbar", "highlight"],
    },
  },

  // ── feature_flags (3) ──────────────────────────────────────────────
  {
    id: "ff-01",
    category: "feature_flags",
    template: "next-app",
    text: `We're launching a major pricing page redesign and want to A/B test it before full rollout. Currently
we have no feature flags — we either ship to everyone or hide behind a Git branch.
Requirements:
- Gate the new pricing page by user segment: internal team (always on), beta users (opt-in), then
  percentage rollout (10% → 50% → 100%).
- Server-side evaluation in Next.js (both RSC and API routes) — no client-side flicker on page load.
- Targeting rules: by user email domain (internal), by user property (plan tier), by percentage.
- Analytics integration: track conversion rate per variant (which pricing page converts better).
Constraints:
- Next.js 14 App Router on Vercel; must work in server components and edge middleware.
- We have ~20k MAU — need a free tier or very cheap plan.
- Team of 4 — want simple DX, not a 200-page feature flag platform.
- Evaluation must be fast (<10ms) — no blocking API calls on every page render.
Compare LaunchDarkly vs Statsig vs Flagsmith vs PostHog Feature Flags vs Vercel Edge Config.
Recommend one, then show:
- SDK initialization for server components and edge middleware
- a feature flag for the pricing page A/B test with percentage rollout
- targeting rules (internal team, beta, percentage)
- how to track conversion events per variant
- the rollout workflow (10% → 50% → 100% with rollback)`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["server_side_evaluation", "no_flicker", "fast_evaluation_10ms", "ab_testing", "free_tier", "edge_middleware"],
      existingStack: ["nextjs_14", "vercel"],
      failureMode: "no feature flags — ship to everyone or hide in Git branches",
      vendorsNamedInPrompt: ["launchdarkly", "statsig", "flagsmith", "posthog", "vercel"],
    },
  },
  {
    id: "ff-02",
    category: "feature_flags",
    template: "next-app",
    text: `We use LaunchDarkly for feature flags but we're hitting pain points:
- Client-side SDK adds ~35kb to our Next.js bundle and causes a visible flicker on SSR pages.
- Evaluation is slow from edge middleware (~150ms round-trip to LD's CDN) which defeats the purpose
  of edge rendering.
- Cost: $10/seat/month × 12 engineers = $120/mo, and we're only using basic boolean flags.
- We want to start doing server-side experimentation (A/B tests) but LD's experimentation add-on
  doubles our cost.
Requirements:
- Server-side evaluation that works in Next.js server components and edge middleware with <10ms latency.
- No client-side SDK — evaluate on the server, pass flag values to client as props/cookies.
- A/B testing with statistical significance tracking.
- Targeting: by user ID, by custom attributes (plan, region), by percentage.
Constraints:
- We're willing to migrate from LaunchDarkly if there's a materially better option for our use case.
- Must integrate with our existing analytics (Segment → Amplitude) for experiment analysis.
- Next.js 14 App Router on Vercel.
Recommend the best option (fix LD setup, switch to Statsig/PostHog/Vercel Edge Config, or something else).
Show the migration or setup plan:
- SDK initialization for server components + edge middleware
- how flags are evaluated server-side and passed to client without flicker
- A/B test setup with conversion tracking
- migration path from LaunchDarkly (flag-by-flag or big-bang?)`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "existing_vendor", "constraint_driven", "workload_driven"],
      constraints: ["no_client_sdk", "edge_sub_10ms", "ab_testing", "segment_amplitude_integration", "cost_sensitive"],
      existingStack: ["launchdarkly", "nextjs_14", "vercel", "segment", "amplitude"],
      failureMode: "35kb bundle, 150ms edge latency, $120/mo for basic boolean flags",
      vendorsNamedInPrompt: ["launchdarkly", "statsig", "posthog", "vercel"],
    },
  },
  {
    id: "ff-03",
    category: "feature_flags",
    template: "node-api",
    text: `We're a seed-stage startup (3 engineers) building a Node.js API. We need feature flags for:
- Gradual rollout of a new billing system (percentage-based, by account).
- Kill switch for expensive AI features if costs spike.
- Beta access gating for enterprise customers.
We have zero budget for developer tooling right now — everything must be free tier or open source.
Requirements:
- Simple SDK: evaluate a flag in 1–2 lines of code, not a ceremony.
- Targeting: by user/account ID, by custom attribute, by percentage.
- A dashboard to toggle flags without redeploying.
- Must work in Node.js (Express) — no browser-only solutions.
Constraints:
- Free tier must cover our usage (~10k flag evaluations/day, 3 seats).
- Open to self-hosted if it's genuinely easy to run (Docker Compose one-liner, not a Kubernetes cluster).
- We deploy on Railway; flags should work regardless of hosting.
- Simple is better than powerful — we don't need 50 integrations, just reliable flag evaluation.
Compare Flagsmith (self-hosted) vs PostHog Feature Flags vs Unleash vs GrowthBook vs ConfigCat.
Recommend one for a tiny team with zero budget. Show:
- setup (hosted or self-hosted Docker Compose)
- SDK integration in Express middleware
- a percentage rollout flag for the billing migration
- a kill switch flag for the AI feature
- the workflow for toggling flags via dashboard`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["zero_budget", "free_tier_required", "simple_sdk", "self_hosted_ok", "dashboard_required"],
      existingStack: ["express", "railway"],
      failureMode: null,
      vendorsNamedInPrompt: ["flagsmith", "posthog", "unleash", "growthbook", "configcat"],
    },
  },

  // ── secrets_management (3) ─────────────────────────────────────────
  {
    id: "sec-01",
    category: "secrets_management",
    template: "node-api",
    text: `We have .env files scattered across 4 services and 3 environments (dev/staging/prod). Onboarding a
new developer takes a full day because they need to collect secrets from Slack DMs, a shared Google Doc,
and manually copy values into their local .env files. Last month someone accidentally committed a .env
to Git and we had to rotate 12 API keys.
Requirements:
- Centralized secrets store that syncs to local dev, CI (GitHub Actions), and production (Railway/Vercel).
- CLI that injects secrets at runtime — no .env files on disk.
- Access control: developers see dev secrets, only CI/deploy sees production secrets.
- Audit log: who accessed what, when.
Constraints:
- Don't want to self-host (no HashiCorp Vault cluster).
- Must integrate with GitHub Actions and Railway/Vercel env vars.
- Team of 6; needs a free or cheap tier.
Compare Doppler vs Infisical vs 1Password Secrets Automation vs HashiCorp Vault (managed/HCP).
Recommend one, then show:
- initial setup and secret import from existing .env files
- local dev workflow (how developers run the app with injected secrets)
- CI integration (GitHub Actions — how secrets get injected without .env files)
- access control setup (dev vs staging vs prod roles)
- what to do when a secret is rotated (propagation story)`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "ecosystem_coupling"],
      patternTags: ["pain_point", "constraint_driven", "existing_vendor"],
      constraints: ["no_self_hosted", "github_actions_integration", "railway_vercel_integration", "access_control", "audit_log"],
      existingStack: ["dotenv_files", "github_actions", "railway", "vercel"],
      failureMode: "secrets in Slack DMs and Google Docs, .env committed to Git",
      vendorsNamedInPrompt: ["doppler", "infisical", "1password", "hashicorp-vault"],
    },
  },
  {
    id: "sec-02",
    category: "secrets_management",
    template: "node-api",
    text: `We need secrets synced across local dev, CI, and production with zero manual steps in CI.
Currently each developer maintains their own .env.local (copy-pasted from a team wiki page that's
always out of date), and CI reads from GitHub Actions secrets (which someone manually updates via
the web UI — often forgetting staging vs production).
Requirements:
- Single source of truth for secrets, with environment separation (dev/staging/prod).
- CLI workflow: developer runs doppler run -- npm start (or equivalent) — no .env file needed.
- CI integration: secrets injected into GitHub Actions without manual management per-repo.
- Preview environments: Vercel preview deploys need a way to get staging secrets automatically.
Constraints:
- Must be managed/hosted — no self-hosted infrastructure.
- Must support environment-based hierarchy (shared base + env-specific overrides).
- Need to work with Vercel (preview + production), GitHub Actions, and local Node.js development.
Compare Doppler vs Infisical vs Vercel Environment Variables (enhanced) vs AWS Secrets Manager.
Recommend one, then show:
- project setup with environment hierarchy (base → dev → staging → prod)
- local dev workflow
- GitHub Actions integration (no manual secret management per-repo)
- Vercel preview environment integration
- secret rotation workflow`,
    metadata: {
      contentTags: ["existing_system", "ecosystem_coupling", "workload_shape"],
      patternTags: ["pain_point", "constraint_driven", "existing_vendor"],
      constraints: ["managed_hosted", "env_hierarchy", "vercel_preview_integration", "zero_manual_ci"],
      existingStack: ["dotenv_files", "github_actions_secrets", "vercel"],
      failureMode: "wiki page always out of date, manual GH Actions secret updates, staging/prod confusion",
      vendorsNamedInPrompt: ["doppler", "infisical", "vercel", "aws-secrets-manager"],
    },
  },
  {
    id: "sec-03",
    category: "secrets_management",
    template: "node-api",
    text: `We're a fintech startup going through SOC 2 Type II audit. Our auditor flagged:
- No automated secret rotation (API keys are 2+ years old).
- No audit trail for who accessed which secrets.
- Shared service accounts for database credentials (no per-developer access).
- Secrets stored in GitHub Actions as plain environment variables (no encryption-at-rest proof).
Requirements:
- Automated secret rotation for database credentials and API keys (at least every 90 days).
- Full audit logging: who accessed, when, from which IP, for which environment.
- Fine-grained access control: per-developer, per-service, per-environment permissions.
- Encryption at rest and in transit (must satisfy auditor's evidence requirements).
- Integration with our existing stack (Node.js, GitHub Actions, AWS ECS).
Constraints:
- Must pass SOC 2 audit controls for secrets management.
- Enterprise plan is OK — this is a compliance requirement, not a nice-to-have.
- Need to migrate ~60 secrets across 4 environments without downtime.
Compare HashiCorp Vault (HCP managed) vs Doppler vs Infisical vs AWS Secrets Manager + Parameter Store.
Recommend one for SOC 2 compliance. Show:
- setup with SOC 2-friendly access policies
- automated rotation for Postgres credentials
- audit log configuration and export (for the auditor)
- migration plan from GitHub Actions secrets (zero-downtime)
- evidence collection: what to show the auditor`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "ecosystem_coupling", "workload_shape"],
      patternTags: ["pain_point", "constraint_driven", "existing_vendor"],
      constraints: ["soc2_type_ii", "automated_rotation_90d", "audit_logging", "fine_grained_acl", "encryption_at_rest"],
      existingStack: ["github_actions", "aws_ecs", "nodejs"],
      failureMode: "SOC 2 audit findings — no rotation, no audit trail, shared credentials",
      vendorsNamedInPrompt: ["hashicorp-vault", "doppler", "infisical", "aws-secrets-manager"],
    },
  },

  // ── developer_portal (2) ───────────────────────────────────────────
  {
    id: "dp-01",
    category: "developer_portal",
    template: "node-api",
    text: `We have ~50 microservices across 8 teams. Nobody knows who owns what. When a service is slow or
throwing errors, incident responders waste 20+ minutes figuring out which team to page. We have:
- Some OpenAPI specs (maybe 60% of services), scattered in repos.
- Ownership info in a Google Sheet that's 6 months out of date.
- No standard way to find a service's runbook, SLO, dependencies, or on-call contact.
Requirements:
- Service catalog: every service registered with owner, tier (critical/standard), dependencies, and links
  (repo, dashboards, runbooks, on-call).
- API docs aggregation: pull OpenAPI specs from repos and display them in one place.
- Scaffolding: a "create new service" template that pre-populates catalog entry, CI pipeline, and
  observability config.
- Self-serve: teams update their own catalog entries, not a central platform team.
Constraints:
- Must integrate with GitHub (repo metadata, CODEOWNERS) and PagerDuty (on-call schedules).
- Prefer something we can adopt incrementally (not a 6-month project to register 50 services).
- Open to self-hosted (we have a Kubernetes cluster) or managed.
- Team of 80 engineers — need it to be low-friction or nobody will use it.
Compare Backstage vs Port vs Cortex vs OpsLevel vs a custom solution (Notion + GitHub Actions).
Recommend one, then show:
- initial setup and deployment
- registering the first 5 services (with catalog YAML or equivalent)
- GitHub integration for repo metadata and CODEOWNERS
- PagerDuty integration for on-call display
- the "create new service" template workflow`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compliance_security"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["github_integration", "pagerduty_integration", "incremental_adoption", "self_serve", "kubernetes_ok"],
      existingStack: ["kubernetes", "github", "pagerduty", "openapi"],
      failureMode: "20+ min to find service owner during incidents, Google Sheet 6 months stale",
      vendorsNamedInPrompt: ["backstage", "port", "cortex", "opslevel"],
    },
  },
  {
    id: "dp-02",
    category: "developer_portal",
    template: "node-api",
    text: `We adopted Backstage 8 months ago. It started well but now it's become a maintenance burden:
- We run it on Kubernetes and it crashes weekly (OOM on the catalog processor with 50+ entities).
- Plugin ecosystem is fragmented — we wrote 3 custom plugins and they break on every Backstage upgrade.
- Developers complain the UI is slow and the search doesn't work well.
- The catalog YAML is in every repo, but teams don't keep it updated (stale ownership, missing docs).
Requirements:
- A developer portal that doesn't require a dedicated platform team to operate.
- Service catalog with ownership, dependencies, and scorecards (track which services have docs,
  monitoring, SLOs, and which don't).
- API docs, runbook links, and deployment status in one place.
- Integrations: GitHub, PagerDuty, Datadog, Jira.
Constraints:
- We want to migrate FROM Backstage, not fix it — the maintenance cost is too high for our team size (6
  platform engineers, 80 total engineering).
- Must import our existing catalog data (don't want to re-register 50 services manually).
- Managed/SaaS strongly preferred.
Compare Port vs Cortex vs OpsLevel vs Rely.io. Recommend one, then outline:
- migration plan from Backstage (importing existing catalog entities)
- scorecard setup (coverage tracking for docs, monitoring, SLOs)
- integration configuration (GitHub, PagerDuty, Datadog)
- how teams self-serve catalog updates without YAML in every repo`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compliance_security"],
      patternTags: ["pain_point", "existing_vendor", "constraint_driven"],
      constraints: ["migrate_from_backstage", "managed_saas", "import_existing_catalog", "scorecards", "no_dedicated_platform_team"],
      existingStack: ["backstage", "kubernetes", "github", "pagerduty", "datadog", "jira"],
      failureMode: "Backstage crashes weekly (OOM), plugins break on upgrade, stale catalog data",
      vendorsNamedInPrompt: ["backstage", "port", "cortex", "opslevel", "rely"],
    },
  },

  // ── llm_observability (3) ──────────────────────────────────────────
  {
    id: "llm-01",
    category: "llm_observability",
    template: "node-api",
    text: `We built an AI customer support bot (Node.js, OpenAI API). It's live in production handling ~500
conversations/day, but we're flying blind:
- We don't know which conversations go well vs badly (no quality scoring).
- Token costs are climbing (~$40/day) but we can't see which conversation patterns are expensive.
- Users report "the bot said something wrong" but we can't find or reproduce the conversation.
- No way to tell if a model update (gpt-4 → gpt-4o) actually improved quality or made it worse.
Requirements:
- Prompt/completion logging: every LLM call with input, output, model, latency, and token count.
- Conversation threading: group all LLM calls in a single user session together.
- Cost tracking: per-conversation, per-model, per-feature breakdown.
- Quality evaluation: at least automated scores (relevance, helpfulness) on a sample of conversations.
- A dashboard where our team can review flagged/low-quality conversations.
Constraints:
- Node.js (no LangChain — we use the OpenAI SDK directly with custom prompts).
- Must handle PII carefully — some conversations contain customer data (option to mask or redact).
- Production load: ~500 conversations/day, ~5 LLM calls per conversation = ~2500 LLM calls/day.
Compare Langfuse vs Helicone vs Braintrust vs LangSmith vs Portkey. Recommend one, then show:
- SDK integration wrapping our OpenAI calls (not LangChain-specific)
- conversation session grouping
- cost breakdown dashboard
- automated quality evaluation setup
- PII redaction configuration`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["no_langchain", "pii_redaction", "quality_evaluation", "conversation_threading", "cost_tracking"],
      existingStack: ["nodejs", "openai_sdk"],
      failureMode: "flying blind — no quality scoring, can't find bad conversations, costs climbing",
      vendorsNamedInPrompt: ["langfuse", "helicone", "braintrust", "langsmith", "portkey"],
    },
  },
  {
    id: "llm-02",
    category: "llm_observability",
    template: "python-api",
    text: `We have a Python RAG pipeline: LangChain → Pinecone for retrieval → GPT-4 for synthesis. The
pipeline works but we can't debug why some answers are bad:
- Sometimes it retrieves irrelevant chunks (retrieval quality issue).
- Sometimes it hallucinates despite having good context (synthesis issue).
- Sometimes the chain takes 8+ seconds and we don't know which step is slow.
- We've tried 4 different prompt templates and have no data on which performs best.
Requirements:
- Tracing: see every step in the chain (retrieval → reranking → synthesis) with latency and input/output.
- Retrieval quality metrics: relevance scores, chunk overlap, retrieval recall.
- Evaluation framework: score answers on faithfulness, relevance, and completeness (automated + human review).
- Prompt versioning: track which prompt template is active, compare metrics across versions.
- CI integration: run an eval suite on every PR that changes prompts or retrieval logic.
Constraints:
- Python + LangChain + Pinecone — need native LangChain integration, not just generic HTTP logging.
- Production traffic: ~1000 queries/day; eval suite should run on a representative sample (~100 queries).
- Self-hosted or managed — we're flexible, but managed is preferred for a team of 5.
Compare Langfuse vs LangSmith vs Braintrust vs Arize Phoenix vs Ragas (eval only).
Recommend one (or a combination), then show:
- LangChain callback integration for automatic tracing
- retrieval quality dashboard
- an evaluation pipeline (automated scoring + human review queue)
- prompt versioning and A/B comparison
- CI eval suite triggered on PR`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven", "existing_vendor"],
      constraints: ["langchain_native", "retrieval_quality_metrics", "prompt_versioning", "ci_eval_suite"],
      existingStack: ["python", "langchain", "pinecone", "gpt4"],
      failureMode: "can't debug bad RAG answers — retrieval vs synthesis vs latency unknowns",
      vendorsNamedInPrompt: ["langfuse", "langsmith", "braintrust", "arize", "ragas"],
    },
  },
  {
    id: "llm-03",
    category: "llm_observability",
    template: "node-api",
    text: `We run an LLM-powered SaaS product (Node.js, Anthropic + OpenAI APIs). We're scaling from beta
(100 users) to production (target 5000 users) and we need enterprise-grade LLM observability.
Requirements:
- Prompt/completion logging with full I/O, model, latency, token count, and cost.
- Multi-model tracking: we use Claude for complex tasks and GPT-4o-mini for simple ones — need to compare
  quality and cost across models.
- User feedback loop: users can thumbs-up/down responses; feed that back into quality dashboards.
- Evaluation: automated scoring (hallucination detection, response relevance) on production traffic.
- Alerting: notify when quality scores drop, costs spike, or latency degrades.
- A dashboard for product managers (non-engineers) to see quality trends, not just raw traces.
Constraints:
- Node.js (TypeScript) — using Anthropic SDK and OpenAI SDK directly (no LangChain).
- SOC 2 in progress — need data residency options and ability to control what's logged (redact PII).
- Production scale: ~10k LLM calls/day, growing to ~50k/day.
Compare Langfuse vs Helicone vs Braintrust vs Portkey vs Humanloop. Recommend one for a production SaaS
at this scale. Show:
- SDK wrapper for both Anthropic and OpenAI calls
- multi-model cost and quality comparison dashboard
- user feedback capture and integration with quality scores
- automated evaluation setup
- SOC 2-friendly configuration (PII handling, data residency)`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["multi_model", "soc2", "pii_redaction", "user_feedback_loop", "non_engineer_dashboard", "no_langchain"],
      existingStack: ["nodejs", "anthropic_sdk", "openai_sdk"],
      failureMode: "scaling from beta to production with no observability — need enterprise-grade",
      vendorsNamedInPrompt: ["langfuse", "helicone", "braintrust", "portkey", "humanloop"],
    },
  },

  // ── incident_management (2) ────────────────────────────────────────
  {
    id: "im-01",
    category: "incident_management",
    template: "node-api",
    text: `We're a team of 15 engineers with no formal on-call process. When something breaks in production:
- Someone notices (usually a customer) and posts in a general Slack channel.
- Whoever sees it first tries to fix it, regardless of expertise.
- There's no escalation — if that person can't fix it, it sits until morning.
- We have no postmortem process, so the same issues keep recurring.
Last month a database failover caused 4 hours of downtime because the one person who knew the DB was asleep.
Requirements:
- On-call rotation: weekly rotation across 3 teams (backend, frontend, platform), with backup on-call.
- Alerting integration: when Datadog or Sentry fires an alert, it should page the on-call person (not a
  Slack channel that everyone ignores).
- Incident lifecycle: declare → triage → assign → resolve → postmortem (with a Slack-based workflow).
- Escalation: if on-call doesn't acknowledge in 10 minutes, escalate to backup, then engineering manager.
- Status page: a public page for customers so they don't tweet at us.
Constraints:
- We use Slack heavily — the incident workflow must live in Slack (create incident from a Slack command,
  updates in a dedicated channel, etc.).
- Must integrate with Datadog (metrics alerts) and Sentry (error alerts).
- Budget: startup budget, prefer <$500/mo total for incident management.
Compare PagerDuty vs Opsgenie vs Incident.io vs FireHydrant vs Rootly. Recommend one, then show:
- on-call schedule setup (3-team weekly rotation with backup)
- Datadog + Sentry alert routing to on-call
- Slack-based incident workflow (declare, triage channel, updates, resolve)
- escalation policy configuration
- postmortem template and process
- status page setup`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling"],
      patternTags: ["pain_point", "constraint_driven", "existing_vendor"],
      constraints: ["slack_native_workflow", "datadog_sentry_integration", "escalation_policy", "status_page", "budget_500mo"],
      existingStack: ["slack", "datadog", "sentry"],
      failureMode: "4-hour downtime — no on-call, no escalation, one person who knew the DB was asleep",
      vendorsNamedInPrompt: ["pagerduty", "opsgenie", "incident-io", "firehydrant", "rootly"],
    },
  },
  {
    id: "im-02",
    category: "incident_management",
    template: "node-api",
    text: `We use PagerDuty for on-call but our incident management process is broken:
- PagerDuty pages the right person, but then everything happens in ad-hoc Slack threads.
- No consistent incident channel naming, no automated timeline, no role assignment (IC, communicator).
- Postmortems are Google Docs that nobody reads; action items never get tracked to completion.
- Stakeholders (PM, support lead) have no visibility into active incidents or expected resolution time.
- We average 8 incidents/month; 3 of the last 10 were repeat failures from un-tracked postmortem actions.
Requirements:
- Slack-native incident workflow: automated incident channel, role assignment, status updates, resolution.
- Automated timeline: capture key events (page, acknowledge, actions, resolution) without manual logging.
- Postmortem with tracked action items that flow into Jira/Linear tickets.
- Stakeholder dashboard: active incidents, severity, estimated resolution, status page updates.
- Integrations: PagerDuty (keep existing on-call), Datadog (alerts), Jira (action items), Statuspage.
Constraints:
- Keep PagerDuty for on-call routing (it works); need a layer on top for incident lifecycle.
- Must integrate deeply with Slack (our engineers live there).
- Need metrics: MTTR, incident frequency by service/team, postmortem completion rate.
Compare Incident.io vs FireHydrant vs Rootly. Recommend one, then show:
- integration with existing PagerDuty on-call schedules
- Slack incident workflow (declare, roles, updates, resolve)
- automated timeline capture
- postmortem → Jira action item flow
- incident metrics dashboard setup`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling"],
      patternTags: ["pain_point", "existing_vendor", "constraint_driven"],
      constraints: ["keep_pagerduty", "slack_native", "jira_action_items", "incident_metrics", "stakeholder_dashboard"],
      existingStack: ["pagerduty", "slack", "datadog", "jira", "statuspage"],
      failureMode: "3 of 10 incidents were repeat failures from un-tracked postmortem actions",
      vendorsNamedInPrompt: ["pagerduty", "incident-io", "firehydrant", "rootly"],
    },
  },

  // ── security_scanning (3) ──────────────────────────────────────────
  {
    id: "ss-01",
    category: "security_scanning",
    template: "node-api",
    text: `We're a Node.js shop (monorepo, 4 services) and we just had a security incident: a transitive
dependency had a known critical CVE that had a patch available for 3 months, but nobody noticed because
we only run npm audit manually (and nobody does).
Requirements:
- Automated dependency vulnerability scanning on every PR and on a daily schedule.
- Block PRs with critical/high vulnerabilities (configurable severity threshold).
- Auto-fix PRs: when a patch is available, automatically open a PR to bump the dependency.
- SAST: basic static analysis for common Node.js security antipatterns (SQL injection, XSS, eval(),
  hardcoded secrets).
- Dashboard: centralized view of all vulnerabilities across all 4 services.
Constraints:
- GitHub Actions for CI — scanning must run there.
- Monorepo with pnpm workspaces — tool must handle shared dependencies and per-package scanning.
- We need to satisfy a customer security questionnaire that asks "do you do SAST and SCA?"
Compare Snyk vs GitHub Advanced Security (Dependabot + CodeQL) vs Socket.dev vs Semgrep + Renovate.
Recommend one stack, then show:
- CI integration (GitHub Actions workflow for PR checks)
- daily scheduled scan configuration
- PR blocking rules (severity threshold)
- auto-fix PR setup for dependency patches
- SAST rules for common Node.js vulnerabilities
- how to answer the customer security questionnaire with this setup`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "ecosystem_coupling", "workload_shape"],
      patternTags: ["pain_point", "constraint_driven", "existing_vendor"],
      constraints: ["github_actions_ci", "monorepo_pnpm", "pr_blocking", "auto_fix_prs", "customer_security_questionnaire"],
      existingStack: ["github_actions", "pnpm_workspaces", "nodejs"],
      failureMode: "critical CVE in transitive dep unnoticed for 3 months — nobody runs npm audit",
      vendorsNamedInPrompt: ["snyk", "github-advanced-security", "socket", "semgrep", "renovate"],
    },
  },
  {
    id: "ss-02",
    category: "security_scanning",
    template: "node-api",
    text: `We deploy Docker containers to AWS ECS and we need vulnerability scanning for:
1. npm dependencies (some with known CVEs we keep kicking down the road).
2. Docker base images (we use node:20 — no idea what CVEs are in the base layer).
3. Secrets in code (we've found 2 hardcoded API keys in old code during manual review).
Current state: we use Dependabot for npm but the PRs pile up (40+ open) and nobody reviews them
because there's no severity prioritization or auto-merge for safe patches.
Requirements:
- Dependency scanning with severity prioritization (critical/high first, not a flood of low/medium PRs).
- Docker image scanning (base image + application layer).
- Secret detection in code (pre-commit hook + CI scan).
- Auto-merge for patch-level dependency updates that pass tests.
- A single dashboard showing vulnerability posture across all services and images.
Constraints:
- Must work with GitHub (PR checks) and AWS ECR (image scanning).
- Want to reduce Dependabot PR noise, not add more tools that create more noise.
- Team of 8 — can't dedicate someone full-time to triage dependency PRs.
Compare Snyk vs Trivy + Dependabot (tuned) vs Grype + Renovate vs GitHub Advanced Security.
Recommend one stack, then show:
- npm dependency scanning with severity-based PR prioritization
- Docker image scanning in CI (before push to ECR)
- secret detection setup (pre-commit + CI)
- auto-merge configuration for safe patches
- unified vulnerability dashboard`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "ecosystem_coupling", "workload_shape"],
      patternTags: ["pain_point", "existing_vendor", "constraint_driven"],
      constraints: ["aws_ecr_integration", "severity_prioritization", "auto_merge_patches", "secret_detection", "reduce_pr_noise"],
      existingStack: ["dependabot", "docker", "aws_ecs", "aws_ecr", "github"],
      failureMode: "40+ open Dependabot PRs nobody reviews, hardcoded API keys found in old code",
      vendorsNamedInPrompt: ["snyk", "trivy", "grype", "renovate", "github-advanced-security"],
    },
  },
  {
    id: "ss-03",
    category: "security_scanning",
    template: "node-api",
    text: `We're building a payment processing API (Node.js/TypeScript, Express). Our security team wants
SAST integrated into CI before we go live. The codebase has common patterns they're worried about:
- SQL queries built with string concatenation (some use Knex, some raw pg queries).
- User input flowing into file paths (path traversal risk).
- JWT verification with no algorithm pinning (alg: none attack surface).
- Console.log statements that might leak sensitive data in production logs.
Requirements:
- SAST that understands TypeScript/Node.js idioms (not just generic regex rules).
- Custom rules: we want to flag our specific antipatterns (raw SQL concat, unpinned JWT alg, console.log
  with user data).
- CI integration: block PRs that introduce new findings (but don't block on existing tech debt).
- IDE integration: show findings inline in VS Code so developers fix issues before pushing.
- Triage workflow: mark findings as false positive or accepted risk.
Constraints:
- Must handle TypeScript (not just JavaScript) with full type-aware analysis.
- Need custom rule authoring — the generic rulesets miss our specific patterns.
- Scan time must be fast (<2 minutes on a 50k LOC codebase) — we run CI on every push.
Compare Semgrep vs CodeQL vs SonarQube vs Snyk Code vs ESLint-plugin-security.
Recommend one, then show:
- CI integration (GitHub Actions PR check)
- custom rules for: SQL concatenation, path traversal, JWT alg pinning, console.log with user data
- baseline configuration (ignore existing findings, only flag new ones)
- VS Code integration setup
- triage workflow for false positives`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "existing_vendor"],
      constraints: ["typescript_aware", "custom_rules", "baseline_mode", "fast_scan_2min", "vscode_integration", "triage_workflow"],
      existingStack: ["typescript", "express", "knex", "pg", "github_actions"],
      failureMode: "payment API with SQL concat, unpinned JWT alg, path traversal risks — security team blocking launch",
      vendorsNamedInPrompt: ["semgrep", "codeql", "sonarqube", "snyk"],
    },
  },

  // ── edge_compute (3) ───────────────────────────────────────────────
  {
    id: "edge-01",
    category: "edge_compute",
    template: "node-api",
    text: `We run a Next.js app on Vercel and a Node.js API on Railway. Some API endpoints are simple
transformations (geo-lookup, A/B flag evaluation, request routing, auth token validation) that don't
need a full Node.js runtime but currently add 200–400ms of latency because the API is in us-east-1
and 40% of our users are in Europe and Asia.
Requirements:
- Deploy lightweight endpoints at the edge (<10ms cold start) for: auth validation, geo-lookup,
  A/B flag evaluation, and request routing/rewriting.
- Keep the main API on Railway for complex logic (DB queries, business logic).
- Edge functions need access to a KV store or equivalent for config/flag data.
- TypeScript support (same language as our main codebase).
Constraints:
- Must integrate with our existing Vercel frontend (middleware, rewrites).
- Can't move the entire API to the edge — only stateless transformation endpoints.
- Need monitoring/logging for edge functions (not just a black box).
Compare Cloudflare Workers + KV vs Vercel Edge Functions + Edge Config vs Deno Deploy vs Fastly Compute.
Recommend one, then show:
- deploying an auth validation edge function
- KV store setup for feature flag data
- routing: which requests go to edge vs origin API
- monitoring/logging setup for edge functions
- the deployment workflow (single deploy command, preview environments)`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven", "existing_vendor"],
      constraints: ["sub_10ms_cold_start", "kv_store", "vercel_integration", "typescript", "edge_monitoring"],
      existingStack: ["nextjs", "vercel", "railway", "nodejs"],
      failureMode: "200-400ms latency for EU/Asia users — API in us-east-1 only",
      vendorsNamedInPrompt: ["cloudflare-workers", "vercel", "deno-deploy", "fastly"],
    },
  },
  {
    id: "edge-02",
    category: "edge_compute",
    template: "node-api",
    text: `We want to move our API's caching and rate-limiting layer to the edge. Currently:
- Rate limiting runs in our Express API (in-memory, so it resets on every deploy and doesn't work across
  multiple instances).
- Caching is Redis on AWS — adds 20–50ms latency for every cache check from the API.
- We cache rendered HTML fragments and JSON responses, keyed by user locale + auth state.
Requirements:
- Edge-based rate limiting with sliding window, per-API-key, globally consistent (not per-instance).
- Edge-based caching with a KV store: cache HTML fragments and JSON, sub-5ms reads.
- Sub-50ms cold starts for the edge functions.
- Ability to purge cache programmatically (when data changes) and by prefix.
- Generous free tier — we do ~5M requests/month.
Constraints:
- Need a globally distributed KV store (not just a single region).
- Must support custom cache keys (not just URL-based — we cache by locale + auth state).
- TypeScript/JavaScript runtime.
- Must work alongside our existing Express API (edge handles caching/rate-limiting, origin handles logic).
Compare Cloudflare Workers + KV + Rate Limiting vs Vercel Edge Functions + Edge Config vs Fastly Compute +
KV. Recommend one, then show:
- rate-limiting middleware at the edge (sliding window, per-API-key)
- caching layer with custom keys (locale + auth state)
- cache purge mechanism (programmatic + prefix-based)
- integration with the origin Express API (what goes to edge vs origin)
- monitoring: cache hit rate, rate limit metrics`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["global_kv_store", "sub_50ms_cold_start", "custom_cache_keys", "programmatic_purge", "free_tier_5m_req"],
      existingStack: ["express", "redis", "aws"],
      failureMode: "rate limiting resets on deploy, Redis adds 20-50ms per cache check",
      vendorsNamedInPrompt: ["cloudflare-workers", "vercel", "fastly"],
    },
  },
  {
    id: "edge-03",
    category: "edge_compute",
    template: "node-api",
    text: `We run a Node.js API serving a global user base (US 40%, EU 30%, Asia 30%). Currently deployed
to a single AWS region (us-east-1) and EU/Asia users experience 300–600ms latency on every API call.
We tried adding CloudFront but it only helps for static assets — our API responses are dynamic and
user-specific so CDN caching doesn't apply.
Requirements:
- Multi-region deployment: API running in at least 3 regions (US, EU, Asia) with automatic failover.
- Single deploy command (not manually deploying to 3 regions).
- Database: need a strategy for data access from multiple regions (read replicas? edge-compatible DB?).
- Session/auth: stateless JWT or a globally replicated session store.
- Zero-downtime deploys and automatic health-check-based routing.
Constraints:
- Node.js API (Express or Fastify) — not willing to rewrite for a WASM/edge runtime.
- Need full Node.js runtime (not the limited edge runtime — we use native modules).
- Database is Postgres on RDS — need to handle multi-region reads without rewriting all queries.
- Budget-conscious: don't want to pay 3x for 3 separate ECS/EKS clusters.
Compare Fly.io vs Railway (multi-region) vs Render (multi-region) vs AWS App Runner (multi-region)
vs Cloudflare Workers (with limitations noted). Recommend one, then show:
- multi-region deployment configuration
- database strategy (read replicas, connection routing)
- deploy workflow (single command, canary/blue-green)
- health checks and automatic failover
- latency monitoring per region`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["full_nodejs_runtime", "multi_region_3", "single_deploy", "postgres_multi_region", "budget_conscious"],
      existingStack: ["express", "aws", "rds_postgres", "cloudfront"],
      failureMode: "300-600ms latency for EU/Asia — single region, CDN doesn't help for dynamic API",
      vendorsNamedInPrompt: ["fly-io", "railway", "render", "aws-app-runner", "cloudflare-workers"],
    },
  },

  // ── agent_dev (6) ─────────────────────────────────────────────────
  {
    id: "agent-01",
    category: "agent_dev",
    template: "python-api",
    text: `We're building a customer support agent that needs to: search our knowledge base, look up order
status in our API, check inventory in our warehouse system, and compose a response. Currently we have
a basic LangChain ReAct agent but it's unreliable in production:
- Tool calls fail silently and the agent hallucinates an answer instead of retrying.
- No memory across turns — each message starts fresh, so multi-step resolutions are impossible.
- The agent sometimes gets stuck in loops (calling the same tool 5 times with the same input).
- No observability into which tools are called, what they return, or why the agent chose that path.
Requirements:
- Tool orchestration with retry logic, timeout, and fallback (if knowledge base search fails, try FAQ).
- Conversational memory: maintain context across a multi-turn support conversation.
- Loop detection and circuit-breaking (max retries, max tool calls per turn).
- Observability: trace every tool call, decision, and response for debugging.
- Human handoff: escalate to a human agent when confidence is low or the customer asks.
Constraints:
- Python (existing codebase) — need to integrate with our existing Flask API.
- Tools are HTTP APIs (not Python functions) — the framework must support async HTTP tool calls.
- Production load: ~200 concurrent conversations.
- We've outgrown basic LangChain ReAct — need something more structured.
Compare LangGraph vs CrewAI vs AutoGen vs Instructor + custom orchestration vs Pydantic AI.
Recommend one, then show:
- agent setup with 3 tools (knowledge base search, order lookup, inventory check)
- retry and fallback logic for tool failures
- conversation memory setup (across turns, with context window management)
- loop detection and max-tool-call limits
- human handoff trigger
- observability integration (tracing each tool call and decision)`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven", "existing_vendor"],
      constraints: ["python_flask", "http_api_tools", "conversation_memory", "loop_detection", "human_handoff", "200_concurrent"],
      existingStack: ["python", "flask", "langchain"],
      failureMode: "agent hallucinates instead of retrying failed tools, no memory, gets stuck in loops",
      vendorsNamedInPrompt: ["langgraph", "crewai", "autogen", "instructor", "pydantic-ai"],
    },
  },
  {
    id: "agent-02",
    category: "agent_dev",
    template: "python-api",
    text: `We have an LLM agent in production (support bot) and we need to evaluate its quality systematically.
Currently we review random conversations manually in a spreadsheet — 5 people score 20 conversations/week.
Problems:
- Manual review doesn't scale (we handle 500 conversations/day, reviewing 20 is a 0.6% sample).
- No agreement on scoring criteria — each reviewer grades differently.
- We can't detect regressions when we change prompts or switch models (no baseline metrics).
- We have no CI gate — prompt changes go live without automated quality checks.
Requirements:
- Automated evaluation: score every conversation on faithfulness, relevance, helpfulness, and safety.
- Evaluation dataset: a curated set of ~100 test cases with expected answers (golden set).
- CI integration: run evals on every PR that changes prompts, with pass/fail threshold.
- Human-in-the-loop: flag low-scoring conversations for manual review (not replace human review).
- Regression detection: compare eval scores across model versions and prompt templates.
Constraints:
- Python — our agent is built with LangGraph.
- We use GPT-4 for the agent; evals should use a different model (to avoid self-evaluation bias).
- Test dataset includes PII from real conversations (need to anonymize or keep eval data secure).
- Budget: eval runs should cost <$5/run for the 100-case golden set.
Compare Braintrust vs LangSmith Evaluations vs Ragas vs DeepEval vs custom (pytest + LLM-as-judge).
Recommend one, then show:
- evaluation dataset format and management
- automated scoring pipeline (faithfulness, relevance, helpfulness, safety)
- CI integration (GitHub Actions — run evals on prompt-changing PRs)
- regression dashboard (compare scores across prompt versions and models)
- human review queue for low-scoring conversations`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven", "existing_vendor"],
      constraints: ["ci_eval_gate", "different_eval_model", "pii_in_test_data", "budget_5_per_run", "regression_detection"],
      existingStack: ["python", "langgraph", "gpt4"],
      failureMode: "manual review of 0.6% sample, no scoring agreement, can't detect regressions",
      vendorsNamedInPrompt: ["braintrust", "langsmith", "ragas", "deepeval"],
    },
  },
  {
    id: "agent-03",
    category: "agent_dev",
    template: "node-api",
    text: `We're building a RAG-powered internal knowledge search for our company (~10k documents: Confluence,
Google Docs, Slack threads, GitHub issues). Current implementation is basic — we chunked everything
into a Pinecone index and use GPT-4 to synthesize, but quality is poor:
- Retrieval misses relevant docs (recall problem) — it finds the keyword but misses the concept.
- Chunking is too coarse (whole pages) — retrieved chunks contain mostly irrelevant padding.
- No access control: every user sees every doc, including HR-confidential and finance docs.
- No incremental updates: we re-index everything weekly via a cron job that takes 6 hours.
Requirements:
- Better chunking strategy: semantic chunking or hierarchical chunks (parent-child with context).
- Hybrid retrieval: dense (embedding) + sparse (BM25/keyword) search with reranking.
- Access control: filter results based on the querying user's permissions (per-doc or per-folder ACLs).
- Incremental ingestion: index new/changed docs within minutes, not weekly batch.
- Answer quality: citation with source links, "I don't know" when context is insufficient.
Constraints:
- Node.js/TypeScript API (existing codebase).
- Documents come from Confluence REST API, Google Drive API, and Slack API — need connectors.
- ~10k documents today, growing to ~50k in a year. Mostly text, some PDFs.
- Self-hosted vector store is fine (we run Kubernetes); managed is also fine.
Compare Pinecone + LlamaIndex vs Weaviate vs Qdrant vs Milvus vs a managed RAG platform (Vectara, Cohere).
Recommend one stack, then show:
- document ingestion pipeline (Confluence, Google Drive, Slack connectors)
- semantic chunking strategy with parent-child context
- hybrid retrieval setup (dense + sparse + reranking)
- access control integration
- incremental sync architecture
- the RAG query endpoint with citations and "I don't know" handling`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven", "llm_era", "existing_vendor"],
      constraints: ["access_control", "incremental_ingestion", "hybrid_retrieval", "semantic_chunking", "citations"],
      existingStack: ["nodejs", "pinecone", "gpt4", "kubernetes", "confluence", "google_drive", "slack"],
      failureMode: "poor recall, coarse chunking, no access control, 6-hour weekly re-index",
      vendorsNamedInPrompt: ["pinecone", "llamaindex", "weaviate", "qdrant", "milvus", "vectara", "cohere"],
    },
  },
  {
    id: "agent-04",
    category: "agent_dev",
    template: "python-api",
    text: `We run an LLM application with 12 different prompt templates (customer support, summarization,
classification, extraction, etc.). We iterate on prompts frequently but have no system:
- Prompts are hardcoded in Python files — changing one requires a code deploy.
- We've accidentally deployed a broken prompt twice (typo in the system message).
- We want to A/B test prompts but currently just eyeball outputs from a few test cases.
- No rollback mechanism — if a new prompt is worse, we have to redeploy the old code.
Requirements:
- Prompt versioning: every prompt change is tracked with a version history.
- A/B testing: run two prompt versions simultaneously, measure which performs better.
- Rollback: instantly revert to a previous prompt version without code deploy.
- Evaluation: automated quality comparison between prompt versions on a test set.
- Environment promotion: test in staging, promote to production with approval.
Constraints:
- Python (FastAPI) application — need a Python SDK.
- 12 prompt templates, each with 5–15 versions of iteration history we'd like to preserve.
- Production: ~5k prompt evaluations/day across all templates.
- Don't want prompts in a database we manage — prefer a managed platform.
Compare Humanloop vs PromptLayer vs Portkey vs Langfuse (prompt management) vs Braintrust.
Recommend one, then show:
- migrating 3 prompt templates from hardcoded Python to the managed platform
- version history and diff view
- A/B test setup between two prompt versions
- automated evaluation comparing versions
- the deployment workflow: staging → approval → production
- rollback procedure`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["python_fastapi", "prompt_versioning", "ab_testing", "instant_rollback", "staging_prod_promotion"],
      existingStack: ["python", "fastapi"],
      failureMode: "prompts hardcoded in Python, broken prompt deployed twice, no rollback",
      vendorsNamedInPrompt: ["humanloop", "promptlayer", "portkey", "langfuse", "braintrust"],
    },
  },
  {
    id: "agent-05",
    category: "agent_dev",
    template: "node-api",
    text: `We're building a content creation pipeline with 3 specialized LLM agents:
1. Research agent: searches the web, reads source material, extracts key facts.
2. Writer agent: takes research output and produces a draft article.
3. Editor agent: reviews the draft for accuracy, tone, and factual grounding against the research.
Currently these are 3 separate API calls glued together with if/else logic. Problems:
- No structured handoff between agents (we pass raw text strings).
- If the editor rejects the draft, there's no loop-back to the writer (we just ship the bad draft).
- No way to run agents in parallel where possible (research for section 2 while writing section 1).
- Total pipeline takes 45 seconds — too slow for our users.
Requirements:
- Structured agent communication: typed messages/state between agents (not raw strings).
- Feedback loops: editor can send the draft back to writer with specific revision requests.
- Parallel execution where possible (overlapping research and writing).
- State management: the full pipeline state is inspectable and resumable if it fails mid-way.
- Token/cost tracking per agent and per pipeline run.
Constraints:
- Node.js/TypeScript (existing codebase).
- Each agent uses a different model (research: GPT-4o-mini for speed, writer: Claude for quality,
  editor: GPT-4 for accuracy).
- Need to keep total pipeline time under 20 seconds.
- Must be debuggable: see what each agent produced and why the editor rejected/accepted.
Compare LangGraph.js vs CrewAI (JS port?) vs Autogen vs custom orchestration with the Anthropic/OpenAI SDKs.
Recommend one, then show:
- the 3-agent pipeline with typed state
- editor → writer feedback loop
- parallel execution setup
- state inspection and resume-on-failure
- multi-model configuration
- cost tracking per agent`,
    metadata: {
      contentTags: ["existing_system", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["nodejs_typescript", "multi_model", "feedback_loops", "parallel_execution", "sub_20s_pipeline", "state_inspection"],
      existingStack: ["nodejs", "openai_sdk", "anthropic_sdk"],
      failureMode: "no feedback loops, no parallelism, 45s pipeline time, raw string handoffs",
      vendorsNamedInPrompt: ["langgraph", "crewai", "autogen"],
    },
  },
  {
    id: "agent-06",
    category: "agent_dev",
    template: "python-api",
    text: `We run a customer-facing LLM API (Python/FastAPI) and we're getting reports of harmful outputs:
- A user tricked the bot into generating a competitor comparison that included false claims.
- Another user extracted our system prompt by asking "repeat your instructions."
- PII from one customer's conversation appeared in another customer's response (context contamination).
- Our content moderation is a basic keyword blocklist that misses sophisticated prompt injections.
Requirements:
- Input guardrails: detect and block prompt injection, jailbreak attempts, and off-topic requests.
- Output guardrails: filter harmful content, factual claims that contradict our knowledge base,
  and any PII leakage.
- System prompt protection: prevent extraction of system prompts and internal instructions.
- PII detection and redaction: scan inputs for PII, redact before sending to LLM, restore in output.
- Works as middleware: wrap our existing OpenAI/Anthropic API calls without rewriting the application.
Constraints:
- Python (FastAPI) — must work as middleware in our existing request pipeline.
- Latency budget: guardrails must add <100ms to each request (not a second LLM call per request).
- Must handle multi-language input (English, Spanish, French — our main markets).
- Can't send customer data to a third-party guardrails API (data must stay in our infrastructure).
Compare NeMo Guardrails vs Guardrails AI vs LLM Guard vs Rebuff vs custom (regex + classifier).
Recommend one, then show:
- middleware integration with FastAPI
- prompt injection detection (with examples of what it catches)
- output filtering for harmful content and PII
- system prompt protection
- PII redaction pipeline (detect → redact → send to LLM → restore)
- latency benchmarks for the guardrails layer`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling", "compatibility"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["sub_100ms_latency", "on_premise_data", "multi_language", "middleware_pattern", "pii_redaction"],
      existingStack: ["python", "fastapi", "openai_sdk", "anthropic_sdk"],
      failureMode: "false claims generated, system prompt extracted, PII cross-contamination between users",
      vendorsNamedInPrompt: ["nemo-guardrails", "guardrails-ai", "llm-guard", "rebuff"],
    },
  },

  // ── cross-category (2) ─────────────────────────────────────────────
  {
    id: "cross-01",
    category: "cross-category",
    template: "next-app",
    text: `I'm building a B2B SaaS from scratch — a project management tool for construction companies.
I've bootstrapped the Next.js 14 (App Router) frontend on Vercel, but I need the entire backend
infrastructure stack. This is a regulated industry: customers will ask about SOC 2, data residency,
and audit trails before buying.
Requirements (pick the best vendor for each):
- Database: Postgres with multi-tenant RLS, branching for preview envs.
- Auth: email magic link + Google OAuth + SAML for enterprise customers.
- Error tracking: client + server with source maps and session replay.
- Feature flags: server-side evaluation for SSR, A/B testing for the onboarding flow.
- CI/CD: PR checks (lint, type-check, test), plus E2E tests against Vercel preview URLs.
- Observability: structured logging + tracing for API routes (we'll have ~50 API routes at launch).
- Secrets management: centralized, with environment separation (dev/staging/prod).
Constraints:
- Solo founder for now, hiring 2 engineers next quarter — everything must be low-maintenance.
- Budget: <$200/mo total for all developer tooling (free tiers where possible).
- Must be SOC 2-ready: audit logs, data residency options, encryption at rest.
- Stack: Next.js 14, Vercel, TypeScript — everything must work in this ecosystem.
For each category, recommend one vendor, explain why, and note what you'd change at scale (when we
hit 100 customers or $1M ARR). Then show the actual setup for the top 3 most critical pieces.`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling"],
      patternTags: ["constraint_driven", "workload_driven"],
      constraints: ["soc2_ready", "budget_200mo", "solo_founder", "saml_enterprise", "low_maintenance"],
      existingStack: ["nextjs_14", "vercel", "typescript"],
      failureMode: null,
      vendorsNamedInPrompt: [],
    },
  },
  {
    id: "cross-02",
    category: "cross-category",
    template: "node-api",
    text: `This Node.js API (Express, ~30 routes) is about to go live with our first enterprise customer.
Their security team sent us a vendor questionnaire asking about:
- Error monitoring and incident response
- Logging and audit trails
- Health checks and uptime monitoring
- Graceful shutdown and zero-downtime deploys
- Secret management (no hardcoded credentials)
- Dependency vulnerability scanning
Currently we have none of this — just console.log and process.exit. We need to go from zero to
"enterprise-ready" in the next 2 weeks.
Requirements:
- Error monitoring: catch unhandled exceptions, aggregate, alert on Slack.
- Structured logging: JSON logs with request-id correlation, shipped to a searchable backend.
- Health checks: /health endpoint that checks DB + Redis connectivity, used by load balancer.
- Graceful shutdown: drain in-flight requests on SIGTERM, close DB connections cleanly.
- Secret management: centralized, with audit log (for the vendor questionnaire).
- Dependency scanning: automated CVE checks in CI.
Constraints:
- Express on AWS ECS (Fargate) — must work in this environment.
- 2-week timeline — need the fastest path to "checks all the boxes" for the questionnaire.
- Team of 4 — no time for complex multi-tool setups. Prefer vendors that cover multiple needs.
- Budget: <$100/mo for all of this combined.
For each requirement, recommend the fastest-to-implement option. Show the actual code for:
- structured logging middleware with request-id correlation
- health check endpoint
- graceful shutdown handler
- error monitoring integration
- the answers we should give on the vendor security questionnaire for each item`,
    metadata: {
      contentTags: ["existing_system", "compliance_security", "workload_shape", "ecosystem_coupling"],
      patternTags: ["pain_point", "constraint_driven", "workload_driven"],
      constraints: ["2_week_deadline", "enterprise_questionnaire", "budget_100mo", "ecs_fargate", "team_of_4"],
      existingStack: ["express", "aws_ecs_fargate", "redis", "postgres"],
      failureMode: "zero production readiness — console.log and process.exit, enterprise customer waiting",
      vendorsNamedInPrompt: [],
    },
  },
];

// ── DB-backed prompt loading ──────────────────────────────────────

function rowToBenchmarkPrompt(row: PromptRow): BenchmarkPrompt {
  const meta = row.metadata as Record<string, unknown>;
  return {
    id: row.id,
    category: row.category ?? "other",
    template: (row.template as TemplateType) ?? "node-api",
    text: row.text,
    metadata: {
      contentTags: (meta.contentTags ?? []) as ContentTag[],
      patternTags: (meta.patternTags ?? []) as PatternTag[],
      constraints: (meta.constraints as string[]) ?? [],
      existingStack: (meta.existingStack as string[]) ?? [],
      failureMode: (meta.failureMode as string) ?? null,
      vendorsNamedInPrompt: (meta.vendorsNamedInPrompt as string[]) ?? [],
    },
  };
}

/**
 * Load benchmark prompts from the database.
 * Falls back to the hardcoded BENCHMARK_PROMPTS array when the
 * prompts table is empty or unreachable.
 */
export async function loadBenchmarkPrompts(pool: Queryable): Promise<BenchmarkPrompt[]> {
  const seeded = await hasPrompts(pool, "benchmark");
  if (!seeded) return BENCHMARK_PROMPTS;

  const rows = await loadPromptsByKind(pool, "benchmark");
  if (rows.length === 0) return BENCHMARK_PROMPTS;

  return rows.map(rowToBenchmarkPrompt);
}
