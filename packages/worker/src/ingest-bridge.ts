import { Pool } from "pg";
import {
  extractVendorMentions,
  extractVendorRejections,
  extractResponseContext,
  classifyIntent,
  loadVendorTaxonomyFromDb,
  loadPackageMapFromDb,
  createPackageResolver,
} from "@obs/shared";
import type { VendorTaxonomy, ParsedSession } from "@obs/shared";
import type { BenchmarkResult } from "@obs/benchmark/lib";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

// ── Transcript parsers (inline, lightweight) ────────────────────────

/**
 * Parse a Claude Code JSONL transcript into a minimal ParsedSession.
 * This is a lightweight version — we just need turns for vendor extraction.
 */
function parseTranscriptFile(filePath: string): ParsedSession | null {
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(Boolean);

  let sessionId = "";
  let cwd = "";
  const turns: ParsedSession["turns"] = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);

      if (obj.sessionId && !sessionId) sessionId = obj.sessionId;
      if (obj.cwd && !cwd) cwd = obj.cwd;

      if (obj.type === "human" && obj.message?.content) {
        const text = obj.message.content
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { text: string }) => b.text)
          .join("\n");
        turns.push({
          role: "user",
          textContent: text,
          toolUses: [],
          toolResults: [],
          timestamp: obj.timestamp ?? new Date().toISOString(),
        });
      }

      if (obj.type === "assistant" && obj.message?.content) {
        const textParts: string[] = [];
        const toolUses: ParsedSession["turns"][0]["toolUses"] = [];

        for (const block of obj.message.content) {
          if (block.type === "text" && block.text) {
            textParts.push(block.text);
          } else if (block.type === "tool_use") {
            toolUses.push({
              toolName: block.name ?? "",
              input: block.input ?? {},
              id: block.id ?? "",
            });
          }
        }

        turns.push({
          role: "assistant",
          textContent: textParts.join("\n"),
          toolUses,
          toolResults: [],
          timestamp: obj.timestamp ?? new Date().toISOString(),
        });
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (!sessionId) return null;

  return {
    id: sessionId,
    platform: "claude_code",
    modelId: null,
    cwd,
    gitBranch: "__obs_bench__",
    startedAt: turns[0]?.timestamp ?? new Date().toISOString(),
    endedAt: turns[turns.length - 1]?.timestamp ?? null,
    turns,
    filePath,
  };
}

// ── Main ingest function ────────────────────────────────────────────

/**
 * Ingest benchmark results into PostgreSQL.
 * For each result with a transcript, parse it and extract vendor observations.
 */
export async function ingestResults(
  results: BenchmarkResult[],
  jobId: string,
  pool: Pool,
): Promise<void> {
  const [taxonomy, packageResolver] = await Promise.all([
    getTaxonomy(pool),
    getPackageResolver(pool),
  ]);

  for (const result of results) {
    // Try to parse the transcript
    let session: ParsedSession | null = null;
    if (result.transcriptPath) {
      session = parseTranscriptFile(result.transcriptPath);
    }

    // If no transcript file, create a synthetic session from stdout
    if (!session && result.stdout) {
      session = {
        id: `onboard-${jobId}-${result.promptId}-${result.assistant}`,
        platform: result.assistant,
        modelId: null,
        cwd: `/tmp/obs-bench-onboard/${jobId}/${result.promptId}-${result.assistant}`,
        gitBranch: "__obs_bench__",
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        turns: [{
          role: "assistant",
          textContent: result.stdout,
          toolUses: [],
          toolResults: [],
          timestamp: result.startedAt,
        }],
        filePath: `onboard/${jobId}/${result.promptId}-${result.assistant}.jsonl`,
      };
    }

    // For failed runs with no transcript and no stdout, create a minimal error
    // session so the scorer sees them in sessionCount and platformCoverage.
    // Without this, failed runs are invisible and produce platformCoverage: {}.
    if (!session && result.error) {
      session = {
        id: `onboard-${jobId}-${result.promptId}-${result.assistant}-err`,
        platform: result.assistant,
        modelId: null,
        cwd: `/tmp/obs-bench/${jobId}/${result.promptId}-${result.assistant}`,
        gitBranch: "__obs_bench__",
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        turns: [{
          role: "assistant",
          textContent: `[benchmark error: ${result.error}]`,
          toolUses: [],
          toolResults: [],
          timestamp: result.startedAt,
        }],
        filePath: `onboard/${jobId}/${result.promptId}-${result.assistant}-error.jsonl`,
      };
    }

    if (!session || session.turns.length === 0) continue;

    // Store session
    await pool.query(`
      INSERT INTO sessions (id, source_platform, model_id, started_at, ended_at, cwd, git_branch, turn_count, file_path, is_benchmark)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
      ON CONFLICT(id) DO UPDATE SET
        ended_at = EXCLUDED.ended_at, turn_count = EXCLUDED.turn_count
    `, [
      session.id,
      session.platform,
      session.modelId,
      session.startedAt,
      session.endedAt,
      session.cwd,
      session.gitBranch,
      session.turns.length,
      session.filePath,
    ]);

    // Extract vendor mentions
    let lastUserText: string | null = null;
    for (const turn of session.turns) {
      if (turn.role === "user" && turn.textContent) {
        lastUserText = turn.textContent.slice(0, 300);
      }

      const mentions = extractVendorMentions(turn, taxonomy, lastUserText, { packageResolver });
      for (const mention of mentions) {
        await pool.query(`
          INSERT INTO observations
            (session_id, vendor_canonical_id, vendor_raw, mention_type, work_category, confidence, context_snippet, user_prompt_snippet, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT DO NOTHING
        `, [
          session.id,
          mention.vendorCanonicalId,
          mention.vendorRaw,
          mention.mentionType,
          mention.workCategory,
          mention.confidence,
          mention.contextSnippet,
          mention.userPromptSnippet,
          mention.timestamp,
        ]);
      }
    }

    // Extract vendor rejections
    const rejections = extractVendorRejections(session.turns, taxonomy);
    for (const rejection of rejections) {
      await pool.query(`
        INSERT INTO vendor_rejections
          (session_id, vendor_canonical_id, rejection_reason, rejection_reason_detail, chosen_alternative, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [
        session.id,
        rejection.vendorCanonicalId,
        rejection.rejectionReason,
        rejection.rejectionReasonDetail,
        rejection.chosenAlternative,
        rejection.timestamp,
      ]);
    }

    // Extract response context for enrichment
    try {
      const sidecarPath = session.cwd ? join(session.cwd, "prompt-metadata.json") : null;
      let constraints: string[] = [];
      if (sidecarPath && existsSync(sidecarPath)) {
        const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8"));
        constraints = sidecar.metadata?.constraints ?? [];
      }

      const responseCtx = extractResponseContext(session.turns, taxonomy, constraints);
      await pool.query(`
        INSERT INTO response_context (session_id, prompt_id, primary_vendor, is_implemented, rationale_snippet,
          vendors_mentioned, trade_offs_snippet, gotchas_snippet, constraints_addressed, extracted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()::text)
        ON CONFLICT(session_id, prompt_id) DO UPDATE SET
          primary_vendor = EXCLUDED.primary_vendor,
          is_implemented = EXCLUDED.is_implemented,
          rationale_snippet = EXCLUDED.rationale_snippet,
          vendors_mentioned = EXCLUDED.vendors_mentioned,
          extracted_at = NOW()::text
      `, [
        session.id,
        result.promptId,
        responseCtx.primaryVendor,
        responseCtx.isImplemented,
        responseCtx.rationaleSnippet,
        JSON.stringify(responseCtx.vendorsMentioned),
        responseCtx.tradeOffsSnippet,
        responseCtx.gotchasSnippet,
        JSON.stringify(responseCtx.constraintsAddressed),
      ]);
    } catch {
      // Enrichment failure is non-fatal
    }
  }
}
