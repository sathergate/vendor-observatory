import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import {
  BENCHMARK_PROMPTS,
  runParallelBatch,
  ClaudeCodeAdapter,
  CodexCliAdapter,
  CursorAgentAdapter,
  type AssistantAdapter,
  type BenchmarkResult,
  type BenchmarkPrompt,
} from "@obs/benchmark/lib";
import { ingestResults } from "./ingest-bridge.js";
import { spawnAndWait } from "./subprocess.js";
import { cleanupOldWorkspaces } from "./cleanup.js";

const BATCH_SIZE = 15;
const TIMEOUT_MS = 120_000;
const PER_PROMPT_BUDGET_USD = 0.30;
const DAILY_WORKSPACE_ROOT = "/tmp/obs-bench-daily";

const ASSISTANT_MAP: Record<string, () => AssistantAdapter> = {
  claude_code: () => new ClaudeCodeAdapter(),
  codex_cli: () => new CodexCliAdapter(),
  cursor: () => new CursorAgentAdapter(),
};

/**
 * Orchestrate a full daily benchmark run:
 *   1. Load prompts and build adapter list
 *   2. Run in batches of BATCH_SIZE using runParallelBatch
 *   3. Track costs in benchmark_costs table
 *   4. Spawn ingest/analyze/digest subprocesses
 *   5. Upload transcripts to Databricks
 *   6. Mark run complete
 */
export async function runDailyBenchmark(runId: string, pool: Pool): Promise<void> {
  console.log(`[daily-runner] Starting daily benchmark run ${runId}`);

  // Load run config from DB
  const { rows: [run] } = await pool.query(
    "SELECT run_date, budget_usd, assistants, category FROM daily_benchmark_runs WHERE id = $1",
    [runId],
  );

  if (!run) throw new Error(`Run ${runId} not found`);

  const budgetUsd: number = run.budget_usd;
  const assistantNames: string[] = run.assistants;
  const category: string | null = run.category;

  // ── 1. Build adapter list ────────────────────────────────────────
  const adapters: AssistantAdapter[] = [];
  for (const name of assistantNames) {
    const factory = ASSISTANT_MAP[name];
    if (!factory) {
      console.warn(`[daily-runner] Unknown assistant: ${name}`);
      continue;
    }
    const adapter = factory();
    if (await adapter.isAvailable()) {
      adapters.push(adapter);
      console.log(`[daily-runner] ✓ ${name} available`);
    } else {
      console.log(`[daily-runner] ✗ ${name} not available, skipping`);
    }
  }

  if (adapters.length === 0) {
    throw new Error("No assistants available for daily benchmark");
  }

  // ── 2. Load and filter prompts ───────────────────────────────────
  let prompts: BenchmarkPrompt[] = BENCHMARK_PROMPTS;
  if (category) {
    prompts = prompts.filter(p => p.category === category);
  }

  if (prompts.length === 0) {
    throw new Error(`No prompts found${category ? ` for category '${category}'` : ""}`);
  }

  // ── 3. Build all prompt × adapter pairs ──────────────────────────
  const allPairs: Array<[BenchmarkPrompt, AssistantAdapter]> = prompts.flatMap(p =>
    adapters.map(a => [p, a] as [BenchmarkPrompt, AssistantAdapter]),
  );

  const totalPairs = allPairs.length;
  console.log(`[daily-runner] ${prompts.length} prompts × ${adapters.length} adapters = ${totalPairs} pairs`);

  await pool.query(
    "UPDATE daily_benchmark_runs SET total_pairs = $1 WHERE id = $2",
    [totalPairs, runId],
  );

  // ── 4. Clean up old workspaces ───────────────────────────────────
  try {
    const cleaned = cleanupOldWorkspaces(DAILY_WORKSPACE_ROOT, 60 * 60 * 1000);
    if (cleaned > 0) console.log(`[daily-runner] Cleaned ${cleaned} old workspaces`);
  } catch { /* non-fatal */ }

  // ── 5. Run in batches ────────────────────────────────────────────
  let successful = 0;
  let failed = 0;
  let skipped = 0;
  const allResults: BenchmarkResult[] = [];

  const batchCount = Math.ceil(totalPairs / BATCH_SIZE);
  console.log(`[daily-runner] Running ${batchCount} batches of up to ${BATCH_SIZE}`);

  for (let batchIdx = 0; batchIdx < batchCount; batchIdx++) {
    // Check budget before each batch
    const { rows: [costRow] } = await pool.query(
      "SELECT COALESCE(SUM(cost_usd), 0) AS total FROM benchmark_costs WHERE run_id = $1",
      [runId],
    );
    const spentSoFar = parseFloat(costRow.total);

    if (spentSoFar >= budgetUsd) {
      const remaining = totalPairs - (batchIdx * BATCH_SIZE);
      skipped += remaining;
      console.log(`[daily-runner] Budget exhausted ($${spentSoFar.toFixed(2)} / $${budgetUsd}). Skipping ${remaining} remaining pairs.`);
      break;
    }

    const batchStart = batchIdx * BATCH_SIZE;
    const batchPairs = allPairs.slice(batchStart, batchStart + BATCH_SIZE);

    console.log(`[daily-runner] Batch ${batchIdx + 1}/${batchCount} (${batchPairs.length} pairs)`);

    const results = await runParallelBatch(batchPairs, {
      budgetUsd: PER_PROMPT_BUDGET_USD,
      timeoutMs: TIMEOUT_MS,
      workspaceRoot: DAILY_WORKSPACE_ROOT,
      jobId: `daily-${run.run_date}`,
    });

    // Record costs and tally results
    for (const result of results) {
      allResults.push(result);

      if (result.error) {
        failed++;
      } else {
        successful++;
      }

      // Record cost in benchmark_costs table
      await pool.query(`
        INSERT INTO benchmark_costs (run_date, run_id, prompt_id, assistant, cost_usd, duration_ms, error)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        run.run_date,
        runId,
        result.promptId,
        result.assistant,
        result.costUsd,
        result.durationMs,
        result.error,
      ]);
    }

    // Update running totals in daily_benchmark_runs
    await pool.query(`
      UPDATE daily_benchmark_runs
      SET successful = $1, failed = $2, skipped = $3,
          total_cost_usd = (SELECT COALESCE(SUM(cost_usd), 0) FROM benchmark_costs WHERE run_id = $4)
      WHERE id = $4
    `, [successful, failed, skipped, runId]);

    console.log(`[daily-runner] Batch ${batchIdx + 1} done: ${results.filter(r => !r.error).length} ok, ${results.filter(r => r.error).length} failed`);
  }

  console.log(`[daily-runner] All batches complete: ${successful} ok, ${failed} failed, ${skipped} skipped`);

  // ── 6. Ingest results ────────────────────────────────────────────
  console.log("[daily-runner] Ingesting results...");
  try {
    await ingestResults(allResults, `daily-${run.run_date}`, pool);
    console.log("[daily-runner] Ingest complete");
  } catch (err) {
    console.error("[daily-runner] Ingest failed (continuing):", err);
  }

  // ── 7. Post-benchmark analysis (subprocess) ─────────────────────
  console.log("[daily-runner] Running cross-session analysis...");
  try {
    const analyzeResult = await spawnAndWait(
      "node",
      ["/app/packages/ingest/dist/index.js", "analyze", "--type", "all"],
      undefined,
      300_000, // 5 min timeout
    );
    if (analyzeResult.exitCode !== 0) {
      console.warn(`[daily-runner] Analysis exited ${analyzeResult.exitCode}: ${analyzeResult.stderr.slice(0, 500)}`);
    } else {
      console.log("[daily-runner] Analysis complete");
    }
  } catch (err) {
    console.error("[daily-runner] Analysis failed (continuing):", err);
  }

  // ── 8. Daily digest (subprocess) ─────────────────────────────────
  console.log("[daily-runner] Generating daily digest...");
  try {
    const digestResult = await spawnAndWait(
      "node",
      ["/app/packages/ingest/dist/index.js", "digest"],
      undefined,
      120_000, // 2 min timeout
    );
    if (digestResult.exitCode !== 0) {
      console.warn(`[daily-runner] Digest exited ${digestResult.exitCode}: ${digestResult.stderr.slice(0, 500)}`);
    } else {
      console.log("[daily-runner] Digest complete");
    }
  } catch (err) {
    console.error("[daily-runner] Digest failed (continuing):", err);
  }

  // ── 9. Upload transcripts to Databricks ──────────────────────────
  await uploadTranscriptsToDatabricks(run.run_date);

  // ── 10. Mark run complete ────────────────────────────────────────
  await pool.query(`
    UPDATE daily_benchmark_runs
    SET completed_at = NOW(),
        successful = $1, failed = $2, skipped = $3,
        total_cost_usd = (SELECT COALESCE(SUM(cost_usd), 0) FROM benchmark_costs WHERE run_id = $4)
    WHERE id = $4
  `, [successful, failed, skipped, runId]);

  console.log(`[daily-runner] Daily benchmark run ${runId} complete`);
}

/**
 * Upload raw JSONL transcripts to a Databricks volume for archival.
 * Uses the Databricks Files API: PUT /api/2.0/fs/files/{path}
 */
async function uploadTranscriptsToDatabricks(runDate: string): Promise<void> {
  const token = process.env.DATABRICKS_TOKEN;
  const host = process.env.DATABRICKS_HOST;

  if (!token || !host) {
    console.log("[daily-runner] DATABRICKS_TOKEN or DATABRICKS_HOST not set, skipping transcript upload");
    return;
  }

  // Collect transcript files from Claude Code and Codex CLI output directories
  const transcriptDirs = [
    join(process.env.HOME ?? "/root", ".claude", "projects"),
    join(process.env.HOME ?? "/root", ".codex", "sessions"),
    join(process.env.HOME ?? "/root", ".cursor-obs", "sessions"),
  ];

  let uploadCount = 0;

  for (const dir of transcriptDirs) {
    if (!existsSync(dir)) continue;

    const files = findJsonlFiles(dir);
    for (const filePath of files) {
      const content = readFileSync(filePath);
      const remotePath = `/Volumes/benchmarks/default/transcripts/${runDate}/${filePath.replace(/^\//, "")}`;

      try {
        const resp = await fetch(`https://${host}/api/2.0/fs/files${remotePath}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/octet-stream",
          },
          body: content,
        });

        if (resp.ok) {
          uploadCount++;
        } else {
          console.warn(`[daily-runner] Databricks upload failed for ${filePath}: ${resp.status} ${resp.statusText}`);
        }
      } catch (err) {
        console.warn(`[daily-runner] Databricks upload error for ${filePath}:`, err);
      }
    }
  }

  console.log(`[daily-runner] Uploaded ${uploadCount} transcript files to Databricks`);
}

/**
 * Recursively find all .jsonl files under a directory.
 */
function findJsonlFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findJsonlFiles(fullPath));
      } else if (entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip unreadable dirs
  }
  return results;
}

/**
 * Mark a daily run as failed with an error message.
 */
export async function markDailyRunFailed(runId: string, err: unknown, pool: Pool): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[daily-runner] Run ${runId} failed:`, msg);
  try {
    await pool.query(
      "UPDATE daily_benchmark_runs SET error = $1, completed_at = NOW() WHERE id = $2",
      [msg.slice(0, 2000), runId],
    );
  } catch (e) {
    console.error(`[daily-runner] Failed to mark run ${runId} as failed:`, e);
  }
}
