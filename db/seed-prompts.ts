#!/usr/bin/env npx tsx
/**
 * Seed the `prompts` table with all hardcoded prompts.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx db/seed-prompts.ts
 *
 * Safe to re-run — uses ON CONFLICT DO UPDATE (upsert).
 *
 * Prompt kinds:
 *   "benchmark"     — comprehensive benchmark scenarios
 *   "fast"          — category-specific fast-benchmark questions
 *   "fast_generic"  — generic cross-category fast-benchmark templates
 *   "system"        — LLM system prompts (enrichment, URL analysis, digest)
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function upsert(prompt: {
  id: string;
  kind: string;
  category?: string | null;
  template?: string | null;
  text: string;
  metadata?: Record<string, unknown>;
}) {
  await pool.query(
    `INSERT INTO prompts (id, kind, category, template, text, metadata, is_active, version, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, 1, NOW())
     ON CONFLICT(id) DO UPDATE SET
       kind = EXCLUDED.kind,
       category = EXCLUDED.category,
       template = EXCLUDED.template,
       text = EXCLUDED.text,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      prompt.id,
      prompt.kind,
      prompt.category ?? null,
      prompt.template ?? null,
      prompt.text,
      JSON.stringify(prompt.metadata ?? {}),
    ],
  );
}

// ═══════════════════════════════════════════════════════════════════
// 1. Fast benchmark prompts (category-specific)
// ═══════════════════════════════════════════════════════════════════

const FAST_PROMPTS: Record<string, string[]> = {
  database: [
    "What's the best serverless database for a Next.js app deployed on Vercel?",
    "I need a Postgres database with branching for preview deployments. What should I use?",
    "Recommend a database for a multi-tenant SaaS with row-level security.",
    "What database works best with Prisma and has a generous free tier?",
    "I need a globally distributed SQL database for low-latency reads. What are my options?",
    "What's the best database for a real-time app that needs subscriptions and live queries?",
    "I'm building an app with vector search and regular CRUD. What database handles both?",
    "Recommend a serverless database that scales to zero and has a good DX.",
    "What database should I use for an edge-first app running on Cloudflare Workers?",
    "I need a MySQL-compatible serverless database. What are the best options?",
    "What's the easiest database to set up for a hackathon project with Node.js?",
    "Recommend a database with built-in auth and storage for a full-stack app.",
    "I need a database that supports automatic schema migrations in CI. What works best?",
    "What embedded database works well for local-first apps with sync?",
  ],
  observability: [
    "What monitoring tool should I use for a Node.js microservices app in production?",
    "I need distributed tracing for my API gateway. What's the best option?",
    "Recommend an observability platform that supports OpenTelemetry natively.",
    "What's the best way to monitor a Next.js app's server-side performance?",
    "I need log aggregation and metrics for a Kubernetes cluster. What should I use?",
    "What observability tool has the best free tier for a small startup?",
    "Recommend a monitoring solution that handles both frontend and backend traces.",
    "What's the best tool for tracking API latency and error rates in production?",
    "I need alerting on custom metrics for my Node.js service. What platform is best?",
    "What APM tool works best with serverless functions on AWS Lambda?",
    "Recommend a tool for real-time dashboards showing request throughput and p99 latency.",
    "What's the best option for structured logging with search and alerting?",
    "I need to monitor a distributed system with 20+ microservices. What platform scales well?",
    "What observability tool integrates best with GitHub Actions for CI/CD monitoring?",
  ],
  error_monitoring: [
    "What's the best error tracking tool for a React + Node.js application?",
    "I need crash reporting for my mobile app backend. What should I use?",
    "Recommend an error monitoring service that groups errors intelligently.",
    "What error tracking tool has the best source map support for Next.js?",
    "I need error monitoring that integrates with Slack and Jira. What's best?",
    "What's the cheapest error tracking solution for a bootstrapped startup?",
    "Recommend an error monitoring tool that shows the full user session replay.",
    "What error tracking service handles both frontend JavaScript and backend Python?",
    "I need to track unhandled promise rejections in Node.js production. What tool?",
    "What error monitoring platform has the best release tracking features?",
    "Recommend an error tracker that deduplicates and auto-assigns issues.",
    "What's the best tool for monitoring errors in a serverless architecture?",
    "I need error tracking with performance monitoring built in. What options exist?",
    "What error monitoring service has the best Vercel integration?",
  ],
  ci_cd: [
    "What's the best CI/CD platform for a monorepo with pnpm workspaces?",
    "I need fast CI that caches Docker layers. What should I use?",
    "Recommend a CI service for running tests on every pull request.",
    "What CI/CD tool has the best integration with GitHub for deploy previews?",
    "I need a CI pipeline that deploys to multiple cloud providers. What's best?",
    "What's the fastest CI service for running a large TypeScript test suite?",
    "Recommend a CI/CD platform with built-in secrets management.",
    "What CI tool works best for deploying containerized apps to Kubernetes?",
    "I need CI that supports parallel test execution across multiple machines. Options?",
    "What's the cheapest CI/CD option for open-source projects?",
    "Recommend a CI service that can run GPU-accelerated ML pipeline tests.",
    "What CI/CD platform has the best caching for npm/pnpm dependencies?",
    "I need deploy previews for every PR in my Next.js app. What CI/CD setup works?",
    "What CI tool integrates best with infrastructure-as-code workflows?",
  ],
  feature_flags: [
    "What's the best feature flag service for a SaaS application?",
    "I need feature flags with percentage-based rollouts. What should I use?",
    "Recommend a feature flag tool that supports A/B testing natively.",
    "What feature flag service has the best React SDK?",
    "I need feature flags that work with server-side rendering. What's best?",
    "What's the cheapest feature flag solution for a small team?",
    "Recommend a feature flag platform with audience targeting and segments.",
    "What feature flag service supports gradual rollouts with automatic rollback?",
    "I need feature flags that sync across frontend and backend. What works?",
    "What feature flag tool has the best local development experience?",
    "Recommend a feature flag service with good TypeScript support.",
    "What's the best open-source alternative for feature flag management?",
    "I need feature flags with an approval workflow. What platform supports this?",
    "What feature flag service integrates best with CI/CD pipelines?",
  ],
  secrets_management: [
    "What's the best secrets management tool for a Node.js application?",
    "I need to sync environment variables across dev, staging, and production. What should I use?",
    "Recommend a secrets manager that integrates with Vercel and GitHub Actions.",
    "What's the best way to manage API keys and database credentials for a team?",
    "I need secrets rotation with zero-downtime for my production services. Options?",
    "What secrets management tool has the best developer experience?",
    "Recommend a tool for managing .env files across multiple environments.",
    "What secrets manager works best for a microservices architecture?",
    "I need a secrets vault that supports dynamic secrets for databases. What's best?",
    "What's the most secure way to handle secrets in a CI/CD pipeline?",
    "Recommend a secrets management solution with audit logging.",
    "What tool handles both secrets management and config management together?",
    "I need to share secrets securely with my development team. What service?",
    "What secrets manager has the best Kubernetes integration?",
  ],
  developer_portal: [
    "What's the best platform for creating API documentation for developers?",
    "I need a developer portal with interactive API playground. What should I use?",
    "Recommend a tool for auto-generating API docs from OpenAPI specs.",
    "What developer documentation platform supports versioned docs?",
    "I need a portal where developers can get API keys and read docs. Options?",
    "What's the best tool for creating beautiful, searchable developer docs?",
    "Recommend a developer portal platform that supports multiple API products.",
    "What documentation tool integrates best with GitHub for content sync?",
    "I need an internal developer portal for service discovery. What works?",
    "What's the best platform for hosting SDK documentation with code samples?",
    "Recommend a developer experience platform with analytics on doc usage.",
    "What tool is best for creating getting-started guides and tutorials?",
    "I need a developer portal with SSO and role-based access. What platform?",
    "What documentation platform supports both REST and GraphQL API docs?",
  ],
  llm_observability: [
    "What's the best tool for monitoring LLM API calls and token usage?",
    "I need to track prompt performance and response quality in production. What should I use?",
    "Recommend an LLM observability platform that supports prompt versioning.",
    "What tool helps debug and trace multi-step LLM agent workflows?",
    "I need cost tracking for my OpenAI and Anthropic API usage. Options?",
    "What LLM monitoring tool supports evaluations and regression testing?",
    "Recommend a platform for logging and analyzing LLM conversations at scale.",
    "What's the best tool for A/B testing different prompts in production?",
    "I need to monitor hallucination rates and response latency. What platform?",
    "What LLM observability tool has the best integration with LangChain?",
    "Recommend a tool for building prompt playgrounds with version control.",
    "What platform tracks LLM token costs broken down by feature and user?",
    "I need an LLM analytics dashboard for my AI-powered SaaS. What works?",
    "What tool helps evaluate LLM output quality with human-in-the-loop scoring?",
  ],
  incident_management: [
    "What's the best incident management platform for a DevOps team?",
    "I need on-call scheduling and alert routing. What should I use?",
    "Recommend an incident response tool that integrates with Slack.",
    "What incident management platform has the best status page feature?",
    "I need automated incident escalation when alerts aren't acknowledged. Options?",
    "What's the best tool for post-incident reviews and blameless retrospectives?",
    "Recommend an incident management solution with runbook automation.",
    "What platform combines on-call management with monitoring alerts?",
    "I need a status page that updates automatically during incidents. What works?",
    "What incident management tool has the best mobile app for on-call engineers?",
    "Recommend a platform for managing incidents across multiple services.",
    "What's the best tool for creating and maintaining operational runbooks?",
    "I need incident management with SLA tracking and reporting. What platform?",
    "What incident response tool integrates best with PagerDuty alternatives?",
  ],
  code_search: [
    "What's the best code search tool for a large monorepo?",
    "I need to search across all my GitHub repositories quickly. What should I use?",
    "Recommend a code search engine that supports regex and structural search.",
    "What code intelligence platform provides go-to-definition across repositories?",
    "I need a tool for searching code patterns across my entire organization. Options?",
    "What's the best self-hosted code search solution?",
    "Recommend a code search tool that understands multiple programming languages.",
    "What platform provides AI-powered code search with natural language queries?",
    "I need code search that indexes private repositories. What works best?",
    "What code search tool integrates best with my IDE?",
    "Recommend a tool for finding duplicate code across repositories.",
    "What's the best tool for searching through code review comments and PRs?",
    "I need cross-repository code navigation for my microservices. What platform?",
    "What code search solution handles polyglot codebases with 10+ languages?",
  ],
  security_scanning: [
    "What's the best security scanning tool for a Node.js application?",
    "I need dependency vulnerability scanning in my CI pipeline. What should I use?",
    "Recommend a SAST tool that works well with TypeScript projects.",
    "What security scanner checks for OWASP Top 10 vulnerabilities?",
    "I need container image scanning for my Docker builds. Options?",
    "What's the best tool for scanning secrets accidentally committed to git?",
    "Recommend a security platform that combines SAST, DAST, and SCA.",
    "What vulnerability scanner has the best GitHub integration?",
    "I need automated security reviews on pull requests. What tool works?",
    "What's the best tool for license compliance scanning of dependencies?",
    "Recommend a security scanner that prioritizes vulnerabilities by exploitability.",
    "What security tool handles both infrastructure-as-code and application scanning?",
    "I need runtime application security monitoring. What platform is best?",
    "What security scanning tool has the lowest false positive rate?",
  ],
  edge_compute: [
    "What's the best platform for deploying serverless functions at the edge?",
    "I need to run JavaScript at the edge close to users. What should I use?",
    "Recommend an edge compute platform for a global API with low latency.",
    "What edge runtime works best with Next.js middleware?",
    "I need edge functions that can access a database. What platform supports this?",
    "What's the best platform for running WebAssembly at the edge?",
    "Recommend an edge compute service with built-in KV storage.",
    "What platform offers the best DX for writing and deploying edge functions?",
    "I need edge compute for A/B testing and personalization. What works?",
    "What edge platform has the most global points of presence?",
    "Recommend an edge compute solution that supports Server-Sent Events.",
    "What's the best option for running a full-stack app at the edge?",
    "I need edge functions with cron scheduling. What platform offers this?",
    "What edge compute platform has the best free tier for side projects?",
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 2. Fast generic prompts (cross-category templates)
// ═══════════════════════════════════════════════════════════════════

const FAST_GENERIC = [
  "What {category} tool would you recommend for a production Node.js application?",
  "I'm setting up a new SaaS product. What {category} solution should I use?",
  "What's the most popular {category} service among startups in 2025?",
  "Recommend a {category} tool that works well with a TypeScript full-stack app.",
  "I need a reliable {category} solution for a team of 5 developers. What's best?",
  "What {category} platform has the best developer experience?",
];

// ═══════════════════════════════════════════════════════════════════
// 3. System prompts (LLM templates)
// ═══════════════════════════════════════════════════════════════════

const SYSTEM_PROMPTS: Array<{ id: string; category: string; text: string; metadata?: Record<string, unknown> }> = [
  {
    id: "system-enrichment",
    category: "enrichment",
    text: `You are an analyst extracting structured data from AI coding assistant responses about developer tool vendor recommendations.

You will be given the text of an AI assistant's response to a developer question. Extract the following information as JSON:

KNOWN VENDORS (canonical IDs): {{VENDOR_NAMES}}

PROMPT CONSTRAINTS to check for: {{CONSTRAINTS}}

Return ONLY valid JSON matching this schema:
{
  "primary_vendor": string | null,       // The canonical vendor ID of the PRIMARY recommendation (the vendor the AI most strongly suggests). null if no clear recommendation.
  "confidence": number,                   // 0.0-1.0 confidence in primary_vendor extraction
  "is_implemented": boolean,              // true if the response includes actual implementation code (npm install, import statements, config files, etc.)
  "reasoning_chain": string,              // 2-4 sentence summary of the logical steps the AI used to arrive at its recommendation
  "vendors": [                            // ALL vendors mentioned, with their disposition
    { "vendor": "canonical_id", "disposition": "recommended|compared|rejected|mentioned|implemented" }
  ],
  "disqualification_reasons": [           // Why specific vendors were rejected or not chosen
    { "vendor": "canonical_id", "reason": "brief explanation" }
  ],
  "trade_offs": string | null,            // Key trade-offs discussed (2-3 sentences max). null if none.
  "gotchas": string | null,               // Warnings, pitfalls, gotchas mentioned (2-3 sentences max). null if none.
  "constraints_addressed": string[],      // Which prompt constraints were genuinely ADDRESSED (not just mentioned) in the response
  "rationale": string | null              // The AI's stated reason for its primary recommendation (1-2 sentences). null if no clear rationale.
}

Rules:
- Use ONLY canonical vendor IDs from the KNOWN VENDORS list. If a vendor is mentioned but not in the list, skip it.
- For constraints_addressed, only include constraints that were genuinely ADDRESSED (the response explains how the vendor handles it), not merely MENTIONED in passing.
- "disposition" meanings: "recommended" = explicitly suggested as the solution, "compared" = discussed as an alternative, "rejected" = explicitly advised against, "mentioned" = named but not evaluated, "implemented" = code/config was written for it
- confidence should be high (>0.8) when there's an explicit "I recommend X" or clear primary choice, medium (0.4-0.8) when the recommendation is implicit, low (<0.4) when it's ambiguous
- Keep reasoning_chain, trade_offs, gotchas, and rationale concise — focus on substance, not verbosity`,
    metadata: { substitutions: ["VENDOR_NAMES", "CONSTRAINTS"] },
  },
  {
    id: "system-url-analysis",
    category: "url_analysis",
    text: `Given this homepage content for {{DOMAIN}}, extract structured product information.

<page_content>
{{PAGE_CONTENT}}
</page_content>

Return a JSON object with exactly these fields:
- product_name: the canonical name of the product (string)
- category: one of {{VALID_CATEGORIES}} (string)
- description: one sentence describing what the product does (string)
- competitors: top 5 direct competitors as an array of {name: string, domain: string}

Return ONLY valid JSON, no markdown or explanation.`,
    metadata: { substitutions: ["DOMAIN", "PAGE_CONTENT", "VALID_CATEGORIES"] },
  },
  {
    id: "system-digest",
    category: "digest",
    text: `You are writing a brief daily digest for a developer tool vendor observatory. Summarize these vendor position changes in 3-5 sentences. Focus on the most impactful changes and what they might signal about market dynamics. Be concise and data-driven.

Changes:
{{CHANGES}}`,
    metadata: { substitutions: ["CHANGES"] },
  },
];

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

async function main() {
  // Ensure the prompts table exists
  await pool.query(`CREATE TABLE IF NOT EXISTS prompts (
    id              TEXT PRIMARY KEY,
    kind            TEXT NOT NULL,
    category        TEXT,
    template        TEXT,
    text            TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prompts_kind ON prompts(kind)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prompts_active ON prompts(is_active) WHERE is_active = TRUE`);

  let count = 0;

  // 1. Fast category prompts
  for (const [category, texts] of Object.entries(FAST_PROMPTS)) {
    for (let i = 0; i < texts.length; i++) {
      const id = `fast-${category}-${String(i + 1).padStart(2, "0")}`;
      await upsert({ id, kind: "fast", category, text: texts[i] });
      count++;
    }
  }
  console.log(`Seeded ${count} fast category prompts`);

  // 2. Fast generic prompts
  let genericCount = 0;
  for (let i = 0; i < FAST_GENERIC.length; i++) {
    const id = `fast-generic-${String(i + 1).padStart(2, "0")}`;
    await upsert({ id, kind: "fast_generic", text: FAST_GENERIC[i] });
    genericCount++;
  }
  console.log(`Seeded ${genericCount} fast generic prompts`);
  count += genericCount;

  // 3. Benchmark prompts — dynamically import from the benchmark package
  try {
    const { BENCHMARK_PROMPTS } = await import("../packages/benchmark/src/prompt-data.js");
    let benchCount = 0;
    for (const p of BENCHMARK_PROMPTS) {
      await upsert({
        id: p.id,
        kind: "benchmark",
        category: p.category,
        template: p.template,
        text: p.text,
        metadata: p.metadata as unknown as Record<string, unknown>,
      });
      benchCount++;
    }
    console.log(`Seeded ${benchCount} benchmark prompts`);
    count += benchCount;
  } catch (err) {
    console.warn("Could not import BENCHMARK_PROMPTS (build first?):", err);
    console.warn("Skipping benchmark prompts — run 'pnpm -r build' first, then re-run this script.");
  }

  // 4. System prompts
  let sysCount = 0;
  for (const sp of SYSTEM_PROMPTS) {
    await upsert({
      id: sp.id,
      kind: "system",
      category: sp.category,
      text: sp.text,
      metadata: sp.metadata ?? {},
    });
    sysCount++;
  }
  console.log(`Seeded ${sysCount} system prompts`);
  count += sysCount;

  console.log(`\nDone. Total: ${count} prompts seeded.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
