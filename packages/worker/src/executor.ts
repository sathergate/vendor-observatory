import { Pool } from "pg";
import type { SourcePlatform } from "@obs/shared";
import {
  selectOnboardingPrompts,
  runParallelBatch,
  ClaudeCodeAdapter,
  CodexCliAdapter,
  type AssistantAdapter,
  type BenchmarkResult,
} from "@obs/benchmark/lib";
import { ingestResults } from "./ingest-bridge.js";
import { computeScores, type ScoreResult } from "./scorer.js";
import { ensureVendor } from "./vendor-mapper.js";
import { runUrlAnalysisFallback } from "./url-analysis-fallback.js";

interface JobRow {
  id: string;
  url: string;
  domain: string;
  product_name: string | null;
  detected_category: string | null;
  competitors: unknown | null;
  url_analysis_completed_at: string | null;
  fast_completed_at: string | null;
  balanced_completed_at: string | null;
}

const TIMEOUT_FAST_MS = 90_000;   // 90s per prompt (generous for fast tier)
const TIMEOUT_BALANCED_MS = 120_000; // 120s per prompt
const PER_PROMPT_BUDGET_USD = 0.50;

/**
 * Orchestrate a single onboarding job end-to-end:
 * 1. URL analysis (if not already done by Next.js API)
 * 2. Fast benchmark (claude_code only, 3 prompts in parallel)
 * 3. Balanced benchmark (claude_code + codex_cli, 10 prompts in parallel)
 */
export async function executeJob(job: JobRow, pool: Pool): Promise<void> {
  // ── URL analysis fallback ──────────────────────────────────────
  if (!job.url_analysis_completed_at) {
    console.log(`[executor] Running URL analysis for job ${job.id}`);
    await runUrlAnalysisFallback(job.id, job.url, job.domain, pool);
    // Reload job with fresh data
    const { rows } = await pool.query(
      "SELECT product_name, detected_category, competitors, url_analysis_completed_at FROM onboarding_jobs WHERE id = $1",
      [job.id]
    );
    if (rows.length > 0) {
      job.product_name = rows[0].product_name;
      job.detected_category = rows[0].detected_category;
      job.competitors = rows[0].competitors;
      job.url_analysis_completed_at = rows[0].url_analysis_completed_at;
    }
  }

  // Ensure vendor exists in taxonomy (create dynamic entry if needed)
  const vendorId = await ensureVendor(
    job.product_name ?? job.domain.split(".")[0],
    job.domain,
    job.detected_category ?? "other",
    pool,
  );

  const competitors = parseCompetitors(job.competitors);

  // ── Fast benchmark ────────────────────────────────────────────
  if (!job.fast_completed_at) {
    console.log(`[executor] Running fast benchmark for job ${job.id}`);
    const prompts = selectOnboardingPrompts(job.detected_category, "fast");
    const adapters: AssistantAdapter[] = [new ClaudeCodeAdapter()];
    const availableAdapters = await filterAvailable(adapters);

    if (availableAdapters.length > 0) {
      const pairs = prompts.flatMap(p =>
        availableAdapters.map(a => [p, a] as [typeof p, typeof a])
      );

      const results = await runParallelBatch(pairs, {
        budgetUsd: PER_PROMPT_BUDGET_USD,
        timeoutMs: TIMEOUT_FAST_MS,
      });

      await ingestResults(results, job.id, pool);
      const scores = await computeScores(job.id, vendorId, competitors, pool);

      await pool.query(
        `UPDATE onboarding_jobs
         SET fast_mention_rate = $1,
             fast_session_count = $2,
             fast_platform_coverage = $3,
             fast_competitor_rates = $4,
             fast_completed_at = NOW()
         WHERE id = $5`,
        [
          scores.mentionRate,
          scores.sessionCount,
          JSON.stringify(scores.platformCoverage),
          JSON.stringify(scores.competitorRates),
          job.id,
        ]
      );
      console.log(`[executor] Fast benchmark complete: mention_rate=${scores.mentionRate}%`);
    } else {
      console.warn("[executor] No adapters available for fast benchmark");
      // Mark as complete with zero results so job can continue
      await pool.query(
        `UPDATE onboarding_jobs
         SET fast_mention_rate = 0, fast_session_count = 0,
             fast_platform_coverage = '{}', fast_competitor_rates = '[]',
             fast_completed_at = NOW()
         WHERE id = $1`,
        [job.id]
      );
    }
  }

  // ── Balanced benchmark ───────────────────────────────────────
  if (!job.balanced_completed_at) {
    console.log(`[executor] Running balanced benchmark for job ${job.id}`);
    const prompts = selectOnboardingPrompts(job.detected_category, "balanced");
    const adapters: AssistantAdapter[] = [new ClaudeCodeAdapter(), new CodexCliAdapter()];
    const availableAdapters = await filterAvailable(adapters);

    if (availableAdapters.length > 0) {
      const pairs = prompts.flatMap(p =>
        availableAdapters.map(a => [p, a] as [typeof p, typeof a])
      );

      const results = await runParallelBatch(pairs, {
        budgetUsd: PER_PROMPT_BUDGET_USD,
        timeoutMs: TIMEOUT_BALANCED_MS,
      });

      await ingestResults(results, job.id, pool);
      const scores = await computeScores(job.id, vendorId, competitors, pool);
      const recommendations = generateRecommendations(scores);

      await pool.query(
        `UPDATE onboarding_jobs
         SET balanced_mention_rate = $1,
             balanced_session_count = $2,
             balanced_ai_readiness = $3,
             balanced_platform_coverage = $4,
             balanced_competitor_rates = $5,
             balanced_recommendations = $6,
             balanced_completed_at = NOW()
         WHERE id = $7`,
        [
          scores.mentionRate,
          scores.sessionCount,
          scores.aiReadiness,
          JSON.stringify(scores.platformCoverage),
          JSON.stringify(scores.competitorRates),
          JSON.stringify(recommendations),
          job.id,
        ]
      );
      console.log(`[executor] Balanced benchmark complete: mention_rate=${scores.mentionRate}%, ai_readiness=${scores.aiReadiness}`);
    } else {
      console.warn("[executor] No adapters available for balanced benchmark");
      await pool.query(
        `UPDATE onboarding_jobs
         SET balanced_mention_rate = 0, balanced_session_count = 0,
             balanced_ai_readiness = 0, balanced_platform_coverage = '{}',
             balanced_competitor_rates = '[]', balanced_recommendations = '[]',
             balanced_completed_at = NOW()
         WHERE id = $1`,
        [job.id]
      );
    }
  }
}

async function filterAvailable(adapters: AssistantAdapter[]): Promise<AssistantAdapter[]> {
  const results: AssistantAdapter[] = [];
  for (const a of adapters) {
    if (await a.isAvailable()) results.push(a);
  }
  return results;
}

interface Competitor {
  name: string;
  domain?: string;
  canonicalId?: string;
}

function parseCompetitors(raw: unknown): Competitor[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Competitor[];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function generateRecommendations(scores: ScoreResult): Array<{
  title: string;
  priority: "P1" | "P2" | "P3";
  impact: "HIGH" | "MEDIUM" | "LOW";
  description: string;
}> {
  const recs: Array<{ title: string; priority: "P1" | "P2" | "P3"; impact: "HIGH" | "MEDIUM" | "LOW"; description: string }> = [];

  if (scores.mentionRate < 10) {
    recs.push({
      title: "Increase AI visibility",
      priority: "P1",
      impact: "HIGH",
      description: "Your product is rarely mentioned by AI coding assistants. Improve SDK discoverability and documentation to increase visibility.",
    });
  }

  if (scores.installRate < 5) {
    recs.push({
      title: "Improve SDK discoverability",
      priority: "P1",
      impact: "HIGH",
      description: "AI assistants rarely install your SDK. Publish to popular package registries with clear, keyword-rich descriptions.",
    });
  }

  if (scores.configRate < 5) {
    recs.push({
      title: "Create integration guides",
      priority: "P2",
      impact: "MEDIUM",
      description: "Write step-by-step integration guides for Next.js, Express, and other popular frameworks to increase configuration adoption.",
    });
  }

  const losing = scores.competitorRates.filter(c => c.delta < -10);
  if (losing.length > 0) {
    recs.push({
      title: "Address competitor gap",
      priority: "P1",
      impact: "HIGH",
      description: `Competitors ${losing.map(c => c.name).join(", ")} are mentioned significantly more often. Build comparison content to help AI assistants accurately position your product.`,
    });
  }

  if (!scores.platformCoverage.claude_code && !scores.platformCoverage.codex_cli) {
    recs.push({
      title: "Expand platform coverage",
      priority: "P2",
      impact: "MEDIUM",
      description: "Your product isn't being recommended on any major AI coding platform. Optimize documentation for AI assistant consumption.",
    });
  }

  if (scores.aiReadiness < 40) {
    recs.push({
      title: "Optimize error messages",
      priority: "P3",
      impact: "LOW",
      description: "Make error messages descriptive and actionable so AI assistants can suggest your product as a fix.",
    });
  }

  // Always have at least one recommendation
  if (recs.length === 0) {
    recs.push({
      title: "Monitor AI mention trends",
      priority: "P3",
      impact: "LOW",
      description: "Your product has good AI visibility. Continue monitoring trends and run periodic benchmarks to track changes.",
    });
  }

  return recs;
}
