export type TemplateType = "node-api" | "next-app" | "python-api";
export type PromptStyle = "open" | "targeted";

export interface BenchmarkPrompt {
  id: string;
  category: string;
  style: PromptStyle;
  template: TemplateType;
  text: string;
}

export const BENCHMARK_PROMPTS: BenchmarkPrompt[] = [
  // ── database (6) ──────────────────────────────────────────────────
  {
    id: "db-open-01",
    category: "database",
    style: "open",
    template: "next-app",
    text: "I'm building a SaaS app with Next.js. I need a PostgreSQL database that works well serverless. What are my options and which would you recommend? Set up the connection.",
  },
  {
    id: "db-open-02",
    category: "database",
    style: "open",
    template: "next-app",
    text: "Set up a database for this project. I need something with good DX, generous free tier, and branching support for preview deployments.",
  },
  {
    id: "db-open-03",
    category: "database",
    style: "open",
    template: "node-api",
    text: "I need a real-time reactive database for a collaborative app. What backends support live queries? Set one up.",
  },
  {
    id: "db-targeted-01",
    category: "database",
    style: "targeted",
    template: "node-api",
    text: "Add Redis caching to this API. I want a managed, serverless Redis that I don't have to operate. Configure the client.",
  },
  {
    id: "db-targeted-02",
    category: "database",
    style: "targeted",
    template: "node-api",
    text: "I need an embedded SQLite database that syncs to the edge. Set up libSQL/Turso for this project.",
  },
  {
    id: "db-targeted-03",
    category: "database",
    style: "targeted",
    template: "next-app",
    text: "Set up Supabase for this project with auth, database, and row-level security.",
  },

  // ── ci_cd (3) ──────────────────────────────────────────────────────
  {
    id: "ci-open-01",
    category: "ci_cd",
    style: "open",
    template: "node-api",
    text: "Set up CI/CD for this project. I want tests to run on every PR, and deploy to production on merge to main.",
  },
  {
    id: "ci-targeted-01",
    category: "ci_cd",
    style: "targeted",
    template: "next-app",
    text: "Create a GitHub Actions workflow that runs lint, test, and build on PRs, and deploys to Vercel on merge.",
  },
  {
    id: "ci-targeted-02",
    category: "ci_cd",
    style: "targeted",
    template: "node-api",
    text: "I want to containerize my CI pipeline so it runs the same locally and in CI. Set up Dagger for this project.",
  },

  // ── observability (3) ──────────────────────────────────────────────
  {
    id: "obs-open-01",
    category: "observability",
    style: "open",
    template: "node-api",
    text: "Add observability to this Node.js API. I want structured logging, metrics, and distributed tracing. What should I use?",
  },
  {
    id: "obs-targeted-01",
    category: "observability",
    style: "targeted",
    template: "node-api",
    text: "Set up Datadog APM for this Express app. I want request tracing and custom metrics.",
  },
  {
    id: "obs-targeted-02",
    category: "observability",
    style: "targeted",
    template: "node-api",
    text: "Configure OpenTelemetry with Honeycomb as the backend for this service.",
  },

  // ── error_monitoring (3) ───────────────────────────────────────────
  {
    id: "err-open-01",
    category: "error_monitoring",
    style: "open",
    template: "next-app",
    text: "Add error tracking to this Next.js app. I want to catch unhandled exceptions in both client and server, with source maps.",
  },
  {
    id: "err-targeted-01",
    category: "error_monitoring",
    style: "targeted",
    template: "next-app",
    text: "Set up Sentry for this Next.js project with the @sentry/nextjs SDK.",
  },
  {
    id: "err-targeted-02",
    category: "error_monitoring",
    style: "targeted",
    template: "node-api",
    text: "Compare error monitoring options for a Node.js project. I'm considering Sentry, Bugsnag, and Rollbar. Which do you recommend and why?",
  },

  // ── feature_flags (3) ──────────────────────────────────────────────
  {
    id: "ff-open-01",
    category: "feature_flags",
    style: "open",
    template: "next-app",
    text: "Add feature flags to this app. I want to gate features by user segment and do percentage rollouts.",
  },
  {
    id: "ff-targeted-01",
    category: "feature_flags",
    style: "targeted",
    template: "next-app",
    text: "Integrate LaunchDarkly into this Next.js app with server-side evaluation.",
  },
  {
    id: "ff-targeted-02",
    category: "feature_flags",
    style: "targeted",
    template: "node-api",
    text: "Set up a lightweight feature flag system. Compare Statsig, DevCycle, and Unleash for a startup.",
  },

  // ── secrets_management (3) ─────────────────────────────────────────
  {
    id: "sec-open-01",
    category: "secrets_management",
    style: "open",
    template: "node-api",
    text: "I'm tired of managing .env files across environments. Set up a secrets management solution for this project.",
  },
  {
    id: "sec-targeted-01",
    category: "secrets_management",
    style: "targeted",
    template: "node-api",
    text: "Configure Doppler for this project so secrets sync to local dev, staging, and production.",
  },
  {
    id: "sec-targeted-02",
    category: "secrets_management",
    style: "targeted",
    template: "node-api",
    text: "Set up HashiCorp Vault for application secrets in this Node.js service.",
  },

  // ── developer_portal (2) ───────────────────────────────────────────
  {
    id: "dp-open-01",
    category: "developer_portal",
    style: "open",
    template: "node-api",
    text: "We have 50 microservices and no service catalog. Set up a developer portal to track service ownership and documentation.",
  },
  {
    id: "dp-targeted-01",
    category: "developer_portal",
    style: "targeted",
    template: "node-api",
    text: "Set up Backstage for our internal developer portal with a service catalog plugin.",
  },

  // ── llm_observability (3) ──────────────────────────────────────────
  {
    id: "llm-open-01",
    category: "llm_observability",
    style: "open",
    template: "node-api",
    text: "Add observability to this LLM-powered app. I need to track token usage, latency, and quality of responses.",
  },
  {
    id: "llm-targeted-01",
    category: "llm_observability",
    style: "targeted",
    template: "python-api",
    text: "Integrate Langfuse for LLM tracing in this Python application that uses LangChain.",
  },
  {
    id: "llm-targeted-02",
    category: "llm_observability",
    style: "targeted",
    template: "node-api",
    text: "Compare LLM observability platforms. I'm evaluating Langfuse, Braintrust, and Helicone for a production app.",
  },

  // ── incident_management (2) ────────────────────────────────────────
  {
    id: "im-open-01",
    category: "incident_management",
    style: "open",
    template: "node-api",
    text: "Set up an on-call rotation and incident response process for this service. We use Slack for communication.",
  },
  {
    id: "im-targeted-01",
    category: "incident_management",
    style: "targeted",
    template: "node-api",
    text: "Configure PagerDuty with escalation policies and Slack integration for this team.",
  },

  // ── security_scanning (3) ──────────────────────────────────────────
  {
    id: "ss-open-01",
    category: "security_scanning",
    style: "open",
    template: "node-api",
    text: "Add security scanning to this project's CI pipeline. I want dependency vulnerability checks and SAST.",
  },
  {
    id: "ss-targeted-01",
    category: "security_scanning",
    style: "targeted",
    template: "node-api",
    text: "Set up Snyk to scan for vulnerabilities in this project's dependencies and Docker images.",
  },
  {
    id: "ss-targeted-02",
    category: "security_scanning",
    style: "targeted",
    template: "node-api",
    text: "Configure Semgrep for custom SAST rules in this TypeScript codebase.",
  },

  // ── edge_compute (3) ───────────────────────────────────────────────
  {
    id: "edge-open-01",
    category: "edge_compute",
    style: "open",
    template: "node-api",
    text: "I want to deploy lightweight API endpoints at the edge, close to users. What are my options? Set one up.",
  },
  {
    id: "edge-targeted-01",
    category: "edge_compute",
    style: "targeted",
    template: "node-api",
    text: "Set up a Cloudflare Worker for this API route with KV storage for caching.",
  },
  {
    id: "edge-targeted-02",
    category: "edge_compute",
    style: "targeted",
    template: "node-api",
    text: "Deploy this function to Fly.io with a multi-region configuration.",
  },

  // ── cross-category (2) ─────────────────────────────────────────────
  {
    id: "cross-01",
    category: "cross-category",
    style: "open",
    template: "next-app",
    text: "I'm starting a new SaaS product from scratch. Set up the full stack: database, auth, error tracking, feature flags, CI/CD, and observability. Pick the best tool for each.",
  },
  {
    id: "cross-02",
    category: "cross-category",
    style: "open",
    template: "node-api",
    text: "This API needs to be production-ready. Add error monitoring, structured logging, health checks, graceful shutdown, and secret management. Use the best tools available.",
  },
];
