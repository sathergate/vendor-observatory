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
        jobId: job.id,
      });

      // Collect any adapter errors for diagnostics
      const failedResults = results.filter(r => r.error);
      if (failedResults.length > 0) {
        const adapterErrors = failedResults
          .map(r => `${r.promptId}/${r.assistant}: ${r.error}`)
          .join("; ");
        console.warn(`[executor] Fast benchmark adapter errors: ${adapterErrors}`);
        // If ALL sessions failed, log the first error to the job record
        if (failedResults.length === results.length) {
          await pool.query(
            "UPDATE onboarding_jobs SET error = $1 WHERE id = $2 AND error IS NULL",
            [`All fast sessions failed. First error: ${failedResults[0].error}`.slice(0, 2000), job.id]
          );
        }
      }

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
        jobId: job.id,
      });

      // Collect any adapter errors for diagnostics
      const failedBalancedResults = results.filter(r => r.error);
      if (failedBalancedResults.length > 0) {
        const adapterErrors = failedBalancedResults
          .map(r => `${r.promptId}/${r.assistant}: ${r.error}`)
          .join("; ");
        console.warn(`[executor] Balanced benchmark adapter errors: ${adapterErrors}`);
        if (failedBalancedResults.length === results.length) {
          await pool.query(
            "UPDATE onboarding_jobs SET error = $1 WHERE id = $2 AND error IS NULL",
            [`All balanced sessions failed. First error: ${failedBalancedResults[0].error}`.slice(0, 2000), job.id]
          );
        }
      }

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

  // Mention rate recommendations (tiered)
  if (scores.mentionRate === 0 && scores.sessionCount > 0) {
    recs.push({
      title: "Increase AI visibility",
      priority: "P1",
      impact: "HIGH",
      description: `Your product was not mentioned in any of ${scores.sessionCount} benchmark sessions. AI assistants are not aware of your product — focus on publishing well-documented SDKs and appearing in popular tutorials.`,
    });
  } else if (scores.mentionRate > 0 && scores.mentionRate < 20) {
    recs.push({
      title: "Increase AI visibility",
      priority: "P1",
      impact: "HIGH",
      description: `Your product was mentioned in ${scores.mentionRate}% of sessions — below the 20% threshold for reliable AI recommendations. Improve documentation structure and add llms.txt to help AI assistants discover your product.`,
    });
  } else if (scores.mentionRate >= 20 && scores.mentionRate < 50) {
    recs.push({
      title: "Strengthen AI positioning",
      priority: "P2",
      impact: "MEDIUM",
      description: `Your ${scores.mentionRate}% mention rate shows moderate visibility. To break above 50%, ensure your product appears in comparison guides and framework-specific integration tutorials.`,
    });
  }

  // Install rate recommendations
  if (scores.installRate === 0 && scores.mentionRate > 0) {
    recs.push({
      title: "Improve SDK discoverability",
      priority: "P1",
      impact: "HIGH",
      description: `AI assistants mention your product (${scores.mentionRate}%) but never install it (0%). Ensure your package is on npm/pip with clear names and descriptions that match how developers describe the problem you solve.`,
    });
  } else if (scores.installRate > 0 && scores.installRate < 10) {
    recs.push({
      title: "Improve SDK discoverability",
      priority: "P2",
      impact: "MEDIUM",
      description: `Only ${scores.installRate}% of sessions install your SDK despite ${scores.mentionRate}% mentioning it. Simplify your installation command and add quick-start examples to your README.`,
    });
  }

  // Config rate recommendations
  if (scores.installRate > 10 && scores.configRate < 5) {
    recs.push({
      title: "Create integration guides",
      priority: "P2",
      impact: "MEDIUM",
      description: `AI assistants install your SDK (${scores.installRate}%) but rarely configure it (${scores.configRate}%). Provide copy-pasteable configuration snippets for Next.js, Express, and other popular frameworks.`,
    });
  }

  // Competitor gap recommendations
  const losing = scores.competitorRates.filter(c => c.delta < -10);
  if (losing.length > 0) {
    const topCompetitor = losing.reduce((a, b) => a.delta < b.delta ? a : b);
    recs.push({
      title: "Address competitor gap",
      priority: "P1",
      impact: "HIGH",
      description: `${topCompetitor.name} is mentioned ${Math.abs(Math.round(topCompetitor.delta))}pp more often than your product (${topCompetitor.mentionRate}% vs ${scores.mentionRate}%). Create comparison content and ensure AI assistants can accurately position your product against alternatives.`,
    });
  }

  // Platform coverage recommendations
  const coveredPlatforms = Object.entries(scores.platformCoverage).filter(([, v]) => v).map(([k]) => k);
  const uncoveredPlatforms = Object.entries(scores.platformCoverage).filter(([, v]) => !v).map(([k]) => k);
  if (uncoveredPlatforms.length > 0 && coveredPlatforms.length > 0) {
    recs.push({
      title: "Expand platform coverage",
      priority: "P2",
      impact: "MEDIUM",
      description: `Your product is recommended on ${coveredPlatforms.join(", ")} but not on ${uncoveredPlatforms.join(", ")}. Investigate why and optimize documentation for broader AI assistant coverage.`,
    });
  } else if (coveredPlatforms.length === 0 && scores.sessionCount > 0) {
    recs.push({
      title: "Expand platform coverage",
      priority: "P1",
      impact: "HIGH",
      description: `Your product isn't being recommended on any AI coding platform despite ${scores.sessionCount} sessions. Optimize your documentation for AI assistant consumption with structured examples and clear API references.`,
    });
  }

  // Always have at least one recommendation
  if (recs.length === 0) {
    if (scores.mentionRate >= 50) {
      recs.push({
        title: "Monitor AI mention trends",
        priority: "P3",
        impact: "LOW",
        description: `Strong performance: ${scores.mentionRate}% mention rate with ${scores.installRate}% install rate across ${scores.sessionCount} sessions. Continue monitoring and run periodic benchmarks to track changes.`,
      });
    } else {
      recs.push({
        title: "Run additional benchmarks",
        priority: "P3",
        impact: "LOW",
        description: `Current data from ${scores.sessionCount} sessions shows ${scores.mentionRate}% mention rate. Consider running more benchmarks to improve statistical confidence.`,
      });
    }
  }

  return recs;
}
