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
  extractVendorRejections,
  loadVendorTaxonomyFromDb,
  loadPackageMapFromDb,
  createPackageResolver,
  loadPromptsByKind,
} from "@obs/shared";
import type { VendorTaxonomy, VendorMention, VendorRejection, ParsedTurn, PromptRow } from "@obs/shared";
import { computeFastScores, type ScoreResult } from "./scorer.js";

// ── Configuration ──────────────────────────────────────────────────

const FAST_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 300;
const PROMPT_COUNT = 20;
const PER_PROMPT_TIMEOUT_MS = 15_000;


// ── Prompt Generation ──────────────────────────────────────────────

function formatCategory(category: string): string {
  return category.replace(/_/g, " ").replace(/-/g, " ");
}

/**
 * Generate fast prompts for a category.
 * Loads from the `prompts` table — requires DB to be seeded (run db/seed-prompts.ts).
 */
export async function generateFastPrompts(
  category: string,
  pool: Pool,
): Promise<Array<{ id: string; text: string }>> {
  const [catRows, genericRows] = await Promise.all([
    loadPromptsByKind(pool, "fast", category),
    loadPromptsByKind(pool, "fast_generic"),
  ]);

  if (catRows.length === 0 && genericRows.length === 0) {
    throw new Error(
      `No fast prompts found in DB for category "${category}". Run: DATABASE_URL=... npx tsx db/seed-prompts.ts`,
    );
  }

  return buildFastPromptList(
    category,
    catRows.map(r => r.text),
    genericRows.map(r => r.text),
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
  vendorRejections: VendorRejection[];
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

    // Extract vendor rejections
    const vendorRejections = extractVendorRejections([turn], taxonomy);

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
      vendorRejections,
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
      vendorRejections: [],
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

  // Store rejections in vendor_rejections table
  // Use a synthetic session ID scoped to the fast benchmark job
  for (const rejection of result.vendorRejections) {
    const syntheticSessionId = `fast-bench-${jobId}-${result.promptId}`;
    // Ensure the synthetic session exists
    await pool.query(`
      INSERT INTO sessions (id, source_platform, model_id, started_at, ended_at, cwd, git_branch, turn_count, file_path, is_benchmark)
      VALUES ($1, 'claude_code', $2, NOW()::text, NOW()::text, $3, '__obs_bench__', 1, $4, TRUE)
      ON CONFLICT(id) DO NOTHING
    `, [
      syntheticSessionId,
      FAST_MODEL,
      `/tmp/obs-bench-fast/${jobId}/${result.promptId}`,
      `fast-bench/${jobId}/${result.promptId}.jsonl`,
    ]);

    await pool.query(`
      INSERT INTO vendor_rejections
        (session_id, vendor_canonical_id, rejection_reason, rejection_reason_detail, chosen_alternative, timestamp)
      VALUES ($1, $2, $3, $4, $5, NOW()::text)
      ON CONFLICT DO NOTHING
    `, [
      syntheticSessionId,
      rejection.vendorCanonicalId,
      rejection.rejectionReason,
      rejection.rejectionReasonDetail,
      rejection.chosenAlternative,
    ]);
  }
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
