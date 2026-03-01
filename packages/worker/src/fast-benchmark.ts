/**
 * Fast Benchmark — Direct API Probes
 *
 * Fires 20 short category-aware prompts in parallel via the Anthropic API
 * (Haiku for speed), extracts vendor mentions from responses, and stores
 * results in the fast_benchmark_responses table.
 *
 * Target: 10-20 seconds total wall clock.
 */

import { Pool } from "pg";
import {
  extractVendorMentions,
  loadVendorTaxonomyFromDb,
  loadPackageMapFromDb,
  createPackageResolver,
  loadPromptsByKind,
  hasPrompts,
} from "@obs/shared";
import type { VendorTaxonomy, VendorMention, ParsedTurn, PromptRow } from "@obs/shared";
import { computeFastScores, type ScoreResult } from "./scorer.js";

// ── Configuration ──────────────────────────────────────────────────

const FAST_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 300;
const PROMPT_COUNT = 20;
const PER_PROMPT_TIMEOUT_MS = 15_000;

// ── Fallback Category Prompt Templates ─────────────────────────────
// Used when the prompts table is empty or unreachable.
// No vendor names — measures organic recall.

const CATEGORY_PROMPTS_FALLBACK: Record<string, string[]> = {
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

// Generic cross-category prompts (fallback, category name substituted at runtime)
const GENERIC_PROMPTS_FALLBACK = [
  "What {category} tool would you recommend for a production Node.js application?",
  "I'm setting up a new SaaS product. What {category} solution should I use?",
  "What's the most popular {category} service among startups in 2025?",
  "Recommend a {category} tool that works well with a TypeScript full-stack app.",
  "I need a reliable {category} solution for a team of 5 developers. What's best?",
  "What {category} platform has the best developer experience?",
];

// ── Prompt Generation ──────────────────────────────────────────────

function formatCategory(category: string): string {
  return category.replace(/_/g, " ").replace(/-/g, " ");
}

/**
 * Generate fast prompts for a category.
 * Loads from the `prompts` table when seeded; falls back to hardcoded defaults.
 */
export async function generateFastPrompts(
  category: string,
  pool: Pool,
): Promise<Array<{ id: string; text: string }>> {
  // Try loading from DB first
  const dbHasPrompts = await hasPrompts(pool, "fast");
  if (dbHasPrompts) {
    const [catRows, genericRows] = await Promise.all([
      loadPromptsByKind(pool, "fast", category),
      loadPromptsByKind(pool, "fast_generic"),
    ]);
    if (catRows.length > 0 || genericRows.length > 0) {
      return buildFastPromptList(
        category,
        catRows.map(r => r.text),
        genericRows.map(r => r.text),
      );
    }
  }

  // Fallback to hardcoded
  return buildFastPromptList(
    category,
    CATEGORY_PROMPTS_FALLBACK[category] ?? [],
    GENERIC_PROMPTS_FALLBACK,
  );
}

function buildFastPromptList(
  category: string,
  categoryTemplates: string[],
  genericTemplates: string[],
): Array<{ id: string; text: string }> {
  const formatted = formatCategory(category);
  const prompts: Array<{ id: string; text: string }> = [];

  // Add category-specific prompts
  for (let i = 0; i < categoryTemplates.length && prompts.length < 14; i++) {
    prompts.push({
      id: `fast-${category}-${String(i + 1).padStart(2, "0")}`,
      text: categoryTemplates[i],
    });
  }

  // Fill remaining with generic prompts (category name substituted)
  for (let i = 0; prompts.length < PROMPT_COUNT && i < genericTemplates.length; i++) {
    prompts.push({
      id: `fast-generic-${String(i + 1).padStart(2, "0")}`,
      text: genericTemplates[i].replace("{category}", formatted),
    });
  }

  // If we still need more, generate extras
  while (prompts.length < PROMPT_COUNT) {
    prompts.push({
      id: `fast-extra-${String(prompts.length + 1).padStart(2, "0")}`,
      text: `What ${formatted} tool or service do you recommend for a modern web application?`,
    });
  }

  // Shuffle to avoid ordering bias
  for (let i = prompts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [prompts[i], prompts[j]] = [prompts[j], prompts[i]];
  }

  return prompts;
}

// ── Taxonomy & Package Map Loading (DB-backed) ────────────────────

let _taxonomy: VendorTaxonomy | null = null;
let _packageResolver: ((pkg: string) => string | null) | null = null;

async function getTaxonomy(pool: Pool): Promise<VendorTaxonomy> {
  if (_taxonomy) return _taxonomy;
  _taxonomy = await loadVendorTaxonomyFromDb(pool);
  return _taxonomy;
}

async function getPackageResolver(pool: Pool): Promise<(pkg: string) => string | null> {
  if (_packageResolver) return _packageResolver;
  const packageMap = await loadPackageMapFromDb(pool);
  _packageResolver = createPackageResolver(packageMap);
  return _packageResolver;
}

// ── API Call ───────────────────────────────────────────────────────

interface PromptResult {
  promptId: string;
  promptText: string;
  responseText: string | null;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  error: string | null;
  vendorMentions: VendorMention[];
  primaryVendor: string | null;
}

async function callApi(
  prompt: { id: string; text: string },
  taxonomy: VendorTaxonomy,
  packageResolver: (pkg: string) => string | null,
): Promise<PromptResult> {
  const start = Date.now();
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PER_PROMPT_TIMEOUT_MS);

    const response = await client.messages.create(
      {
        model: FAST_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt.text }],
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const responseText = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("\n");

    // Extract vendor mentions using the shared extractor
    const turn: ParsedTurn = {
      role: "assistant",
      textContent: responseText,
      toolUses: [],
      toolResults: [],
      timestamp: new Date().toISOString(),
    };
    const vendorMentions = extractVendorMentions(turn, taxonomy, prompt.text.slice(0, 300), { packageResolver });

    // Determine primary vendor (highest confidence "recommended" or "mentioned")
    const primaryVendor = pickPrimaryVendor(vendorMentions);

    return {
      promptId: prompt.id,
      promptText: prompt.text,
      responseText,
      durationMs: Date.now() - start,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      error: null,
      vendorMentions,
      primaryVendor,
    };
  } catch (err) {
    return {
      promptId: prompt.id,
      promptText: prompt.text,
      responseText: null,
      durationMs: Date.now() - start,
      inputTokens: 0,
      outputTokens: 0,
      error: String(err),
      vendorMentions: [],
      primaryVendor: null,
    };
  }
}

function pickPrimaryVendor(mentions: VendorMention[]): string | null {
  // Prefer "recommended" mentions, then "installed", then highest confidence
  const recommended = mentions.filter(m => m.mentionType === "recommended");
  if (recommended.length > 0) {
    return recommended.sort((a, b) => b.confidence - a.confidence)[0].vendorCanonicalId;
  }

  const installed = mentions.filter(m => m.mentionType === "installed");
  if (installed.length > 0) {
    return installed.sort((a, b) => b.confidence - a.confidence)[0].vendorCanonicalId;
  }

  if (mentions.length > 0) {
    return mentions.sort((a, b) => b.confidence - a.confidence)[0].vendorCanonicalId;
  }

  return null;
}

// ── Storage ────────────────────────────────────────────────────────

async function storeResult(result: PromptResult, jobId: string, category: string, pool: Pool): Promise<void> {
  const mentionsJson = result.vendorMentions.map(m => ({
    vendor: m.vendorCanonicalId,
    mentionType: m.mentionType,
    confidence: m.confidence,
    raw: m.vendorRaw,
  }));

  await pool.query(
    `INSERT INTO fast_benchmark_responses
       (job_id, prompt_id, prompt_text, category, response_text, duration_ms,
        input_tokens, output_tokens, model, vendor_mentions, primary_vendor, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (job_id, prompt_id) DO UPDATE SET
       response_text = EXCLUDED.response_text,
       duration_ms = EXCLUDED.duration_ms,
       input_tokens = EXCLUDED.input_tokens,
       output_tokens = EXCLUDED.output_tokens,
       vendor_mentions = EXCLUDED.vendor_mentions,
       primary_vendor = EXCLUDED.primary_vendor,
       error = EXCLUDED.error`,
    [
      jobId,
      result.promptId,
      result.promptText,
      category,
      result.responseText,
      result.durationMs,
      result.inputTokens,
      result.outputTokens,
      FAST_MODEL,
      JSON.stringify(mentionsJson),
      result.primaryVendor,
      result.error,
    ],
  );
}

// ── Orchestrator ───────────────────────────────────────────────────

export interface FastBenchmarkResult {
  scores: ScoreResult;
  totalDurationMs: number;
  successCount: number;
  errorCount: number;
}

interface Competitor {
  name: string;
  domain?: string;
  canonicalId?: string;
}

export async function runFastBenchmark(
  jobId: string,
  vendorId: string,
  category: string,
  competitors: Competitor[],
  pool: Pool,
): Promise<FastBenchmarkResult> {
  const overallStart = Date.now();

  console.log(`[fast-bench] Generating ${PROMPT_COUNT} prompts for category "${category}"`);
  const [prompts, taxonomy, packageResolver] = await Promise.all([
    generateFastPrompts(category, pool),
    getTaxonomy(pool),
    getPackageResolver(pool),
  ]);

  // Fire all prompts in parallel
  console.log(`[fast-bench] Firing ${prompts.length} API calls in parallel (model: ${FAST_MODEL})`);
  const settled = await Promise.allSettled(
    prompts.map(p => callApi(p, taxonomy, packageResolver)),
  );

  // Collect results
  let successCount = 0;
  let errorCount = 0;

  for (const s of settled) {
    if (s.status === "fulfilled") {
      const result = s.value;
      await storeResult(result, jobId, category, pool);
      if (result.error) {
        errorCount++;
        console.warn(`[fast-bench] Prompt ${result.promptId} failed: ${result.error}`);
      } else {
        successCount++;
      }
    } else {
      errorCount++;
      console.warn(`[fast-bench] Unexpected rejection: ${s.reason}`);
    }
  }

  const totalDurationMs = Date.now() - overallStart;
  console.log(
    `[fast-bench] Done in ${totalDurationMs}ms: ${successCount} ok, ${errorCount} errors`,
  );

  if (successCount === 0) {
    throw new Error(
      `All ${PROMPT_COUNT} fast benchmark prompts failed. First error: ${
        settled[0].status === "fulfilled" ? settled[0].value.error : String(settled[0].reason)
      }`,
    );
  }

  // Compute scores from stored results
  const scores = await computeFastScores(jobId, vendorId, competitors, pool);

  return { scores, totalDurationMs, successCount, errorCount };
}
