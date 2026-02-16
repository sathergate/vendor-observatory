export type TemplateType = "node-api" | "next-app" | "python-api";

export interface BenchmarkPrompt {
  id: string;
  category: string;
  template: TemplateType;
  text: string;
}

export const BENCHMARK_PROMPTS: BenchmarkPrompt[] = [
  // ── database (6) ──────────────────────────────────────────────────
  {
    id: "db-01",
    category: "database",
    template: "next-app",
    text: "I'm building a SaaS app with Next.js. I need a PostgreSQL database that works well serverless. What are my options and which would you recommend? Set up the connection.",
  },
  {
    id: "db-02",
    category: "database",
    template: "next-app",
    text: "Set up a database for this project. I need something with good DX, generous free tier, and branching support for preview deployments.",
  },
  {
    id: "db-03",
    category: "database",
    template: "node-api",
    text: "I need a real-time reactive database for a collaborative app. What backends support live queries? Set one up.",
  },
  {
    id: "db-04",
    category: "database",
    template: "node-api",
    text: "Add a caching layer to this API. I want a managed, serverless cache that I don't have to operate — no self-hosted infra. Configure the client.",
  },
  {
    id: "db-05",
    category: "database",
    template: "node-api",
    text: "I need a database that can run embedded in my app but also sync to the cloud and work at the edge. What are my options? Set up the best one.",
  },
  {
    id: "db-06",
    category: "database",
    template: "next-app",
    text: "Set up a backend-as-a-service for this project. I need auth, a database with row-level security, and real-time subscriptions — all from one platform.",
  },

  // ── ci_cd (3) ──────────────────────────────────────────────────────
  {
    id: "ci-01",
    category: "ci_cd",
    template: "node-api",
    text: "Set up CI/CD for this project. I want tests to run on every PR, and deploy to production on merge to main.",
  },
  {
    id: "ci-02",
    category: "ci_cd",
    template: "next-app",
    text: "I need a CI/CD pipeline for this Next.js app. It should run lint, type-check, test, and build on PRs, then auto-deploy on merge. Pick the best tools.",
  },
  {
    id: "ci-03",
    category: "ci_cd",
    template: "node-api",
    text: "I want my CI pipeline to run identically on my laptop and in the cloud. Set up a portable, containerized CI solution for this project.",
  },

  // ── observability (3) ──────────────────────────────────────────────
  {
    id: "obs-01",
    category: "observability",
    template: "node-api",
    text: "Add observability to this Node.js API. I want structured logging, metrics, and distributed tracing. What should I use?",
  },
  {
    id: "obs-02",
    category: "observability",
    template: "node-api",
    text: "I need APM for this Express app — request tracing, latency breakdowns, and custom metrics. I want auto-instrumentation so I don't have to manually annotate every route. Set it up.",
  },
  {
    id: "obs-03",
    category: "observability",
    template: "node-api",
    text: "Set up OpenTelemetry for this service and send traces to a managed backend. I want a hosted solution with a good free tier — not self-hosted Jaeger.",
  },

  // ── error_monitoring (3) ───────────────────────────────────────────
  {
    id: "err-01",
    category: "error_monitoring",
    template: "next-app",
    text: "Add error tracking to this Next.js app. I want to catch unhandled exceptions in both client and server, with source maps.",
  },
  {
    id: "err-02",
    category: "error_monitoring",
    template: "next-app",
    text: "I need error monitoring for this Next.js project with source map support, session replay, and Slack alerting. Set up the best option.",
  },
  {
    id: "err-03",
    category: "error_monitoring",
    template: "node-api",
    text: "Add crash reporting and error aggregation to this Node.js API. I want automatic grouping of similar errors, release tracking, and a generous free tier. What's the best tool?",
  },

  // ── feature_flags (3) ──────────────────────────────────────────────
  {
    id: "ff-01",
    category: "feature_flags",
    template: "next-app",
    text: "Add feature flags to this app. I want to gate features by user segment and do percentage rollouts.",
  },
  {
    id: "ff-02",
    category: "feature_flags",
    template: "next-app",
    text: "I need feature flags with server-side evaluation that works with Next.js SSR and edge middleware. Set up the best option with fast evaluation and no client-side flicker.",
  },
  {
    id: "ff-03",
    category: "feature_flags",
    template: "node-api",
    text: "Add a feature flag system to this API. I want something lightweight with a good free tier, targeting rules, and a simple SDK. I'm a startup — cost matters.",
  },

  // ── secrets_management (3) ─────────────────────────────────────────
  {
    id: "sec-01",
    category: "secrets_management",
    template: "node-api",
    text: "I'm tired of managing .env files across environments. Set up a secrets management solution for this project.",
  },
  {
    id: "sec-02",
    category: "secrets_management",
    template: "node-api",
    text: "I need a secrets manager that syncs across local dev, staging, and production with zero config in CI. I don't want to self-host anything. Set it up.",
  },
  {
    id: "sec-03",
    category: "secrets_management",
    template: "node-api",
    text: "Set up centralized secret management for this Node.js service. I need rotation support, audit logging, and fine-grained access control. What's the best enterprise-grade option?",
  },

  // ── developer_portal (2) ───────────────────────────────────────────
  {
    id: "dp-01",
    category: "developer_portal",
    template: "node-api",
    text: "We have 50 microservices and no service catalog. Set up a developer portal to track service ownership and documentation.",
  },
  {
    id: "dp-02",
    category: "developer_portal",
    template: "node-api",
    text: "I need an internal developer portal with a service catalog, API docs aggregation, and scaffolding templates. What's the best platform? Set it up.",
  },

  // ── llm_observability (3) ──────────────────────────────────────────
  {
    id: "llm-01",
    category: "llm_observability",
    template: "node-api",
    text: "Add observability to this LLM-powered app. I need to track token usage, latency, and quality of responses.",
  },
  {
    id: "llm-02",
    category: "llm_observability",
    template: "python-api",
    text: "I need tracing for my LLM pipeline — I want to see every prompt, completion, and chain step with latency and cost. This is a Python app using LangChain. Set up the best tool.",
  },
  {
    id: "llm-03",
    category: "llm_observability",
    template: "node-api",
    text: "Add LLM observability to this Node.js app. I need prompt/completion logging, cost tracking, evaluation scores, and a dashboard. What's the best hosted platform for a production app?",
  },

  // ── incident_management (2) ────────────────────────────────────────
  {
    id: "im-01",
    category: "incident_management",
    template: "node-api",
    text: "Set up an on-call rotation and incident response process for this service. We use Slack for communication.",
  },
  {
    id: "im-02",
    category: "incident_management",
    template: "node-api",
    text: "I need an incident management platform with escalation policies, Slack integration, and a status page. What should I use? Set it up.",
  },

  // ── security_scanning (3) ──────────────────────────────────────────
  {
    id: "ss-01",
    category: "security_scanning",
    template: "node-api",
    text: "Add security scanning to this project's CI pipeline. I want dependency vulnerability checks and SAST.",
  },
  {
    id: "ss-02",
    category: "security_scanning",
    template: "node-api",
    text: "I need continuous vulnerability scanning for this project's npm dependencies and Docker images. I want automatic PR checks and fix suggestions. Set up the best tool.",
  },
  {
    id: "ss-03",
    category: "security_scanning",
    template: "node-api",
    text: "Add static analysis security testing to this TypeScript codebase. I want custom rules for common security antipatterns and CI integration. What's the best SAST tool?",
  },

  // ── edge_compute (3) ───────────────────────────────────────────────
  {
    id: "edge-01",
    category: "edge_compute",
    template: "node-api",
    text: "I want to deploy lightweight API endpoints at the edge, close to users. What are my options? Set one up.",
  },
  {
    id: "edge-02",
    category: "edge_compute",
    template: "node-api",
    text: "I need to run this API at the edge with a key-value store for caching. I want sub-50ms cold starts and a generous free tier. Set up the best platform.",
  },
  {
    id: "edge-03",
    category: "edge_compute",
    template: "node-api",
    text: "Deploy this service to multiple regions with automatic failover. I want it to run close to users worldwide with a single deploy command. What's the best platform?",
  },

  // ── agent_dev (6) ─────────────────────────────────────────────────
  {
    id: "agent-01",
    category: "agent_dev",
    template: "python-api",
    text: "I'm building an LLM agent that needs to chain multiple tools together — web search, code execution, and database lookups. I want a framework that handles tool orchestration, retries, and memory. Set up the best option for a production agent.",
  },
  {
    id: "agent-02",
    category: "agent_dev",
    template: "python-api",
    text: "I need to evaluate my LLM agent's outputs systematically — accuracy, hallucination rate, and task completion. Set up an evaluation and scoring pipeline that I can run in CI. What's the best platform?",
  },
  {
    id: "agent-03",
    category: "agent_dev",
    template: "node-api",
    text: "I'm building a retrieval-augmented generation (RAG) pipeline. I need document ingestion, vector storage, semantic search, and an LLM to synthesize answers. Set up the full pipeline with the best tools.",
  },
  {
    id: "agent-04",
    category: "agent_dev",
    template: "python-api",
    text: "I need a prompt management and versioning system for my LLM application. I want to A/B test prompts, track which versions perform best, and roll back bad ones. What's the best tool? Set it up.",
  },
  {
    id: "agent-05",
    category: "agent_dev",
    template: "node-api",
    text: "I'm building a multi-agent system where specialized agents collaborate — one for research, one for writing, one for code generation. I need an orchestration framework that handles agent communication, delegation, and state. Set up the best option.",
  },
  {
    id: "agent-06",
    category: "agent_dev",
    template: "python-api",
    text: "I need guardrails for my LLM application — input validation, output filtering, toxicity detection, and PII redaction. I want it to work as middleware in my existing API. What's the best framework? Set it up.",
  },

  // ── cross-category (2) ─────────────────────────────────────────────
  {
    id: "cross-01",
    category: "cross-category",
    template: "next-app",
    text: "I'm starting a new SaaS product from scratch. Set up the full stack: database, auth, error tracking, feature flags, CI/CD, and observability. Pick the best tool for each.",
  },
  {
    id: "cross-02",
    category: "cross-category",
    template: "node-api",
    text: "This API needs to be production-ready. Add error monitoring, structured logging, health checks, graceful shutdown, and secret management. Use the best tools available.",
  },
];
