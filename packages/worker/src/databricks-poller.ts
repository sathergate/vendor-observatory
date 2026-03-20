/**
 * Databricks queue poller — polls worker_queue in PostgreSQL, runs adapters, uploads transcripts.
 *
 * Simple loop:
 * 1. Poll worker_queue (PostgreSQL) for pending tasks
 * 2. Claim one task using SELECT FOR UPDATE SKIP LOCKED
 * 3. Run the appropriate adapter (Claude Code / Codex CLI / Cursor Agent)
 * 4. Upload the transcript to UC Volumes (best-effort if Databricks vars set)
 * 5. Update task status in PostgreSQL
 */

import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import {
  type DatabricksConfig,
  loadDatabricksConfig,
  uploadTranscript,
} from "./databricks-client.js";
import { createWorkspace } from "@obs/benchmark/workspace";
import { ingestResults } from "./ingest-bridge.js";

type AdapterResult = {
  exitCode: number;
  costUsd: number | null;
  durationMs: number;
  transcriptPath: string | null;
  stdout: string;
  stderr: string;
  error: string | null;
};

interface QueueTask {
  id: string;
  run_id: string;
  prompt_id: string;
  agent: string;
  prompt_text: string;
  prompt_template: string;
  prompt_category: string;
  prompt_metadata_json: string;
}

const POLL_INTERVAL_MS = 5000;

export async function startDatabricksPoller(workerId: string, pool: Pool): Promise<void> {
  // Load Databricks config for transcript uploads (best-effort)
  let dbxConfig: DatabricksConfig | null = null;
  try {
    dbxConfig = loadDatabricksConfig();
    console.log(`[databricks-poller] Databricks configured — transcript uploads enabled`);
  } catch {
    console.log("[databricks-poller] Databricks not configured — transcript uploads disabled");
  }

  console.log(`[databricks-poller] ${workerId} starting — polling PostgreSQL worker_queue`);

  while (true) {
    try {
      const task = await claimTask(pool, workerId);
      if (!task) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      console.log(`[databricks-poller] Claimed task ${task.id} (${task.agent} × ${task.prompt_id})`);

      // Mark as running
      await updateTask(pool, task.id, { status: "running" });

      const result = await runTask(dbxConfig, pool, task, workerId);

      await updateTask(pool, task.id, {
        status: result.error ? "failed" : "completed",
        transcript_path: result.transcriptPath ?? undefined,
        cost_usd: result.costUsd ?? undefined,
        duration_ms: result.durationMs,
        exit_code: result.exitCode,
        error: result.error,
      });

      console.log(`[databricks-poller] Task ${task.id} ${result.error ? "failed" : "completed"}`);
    } catch (err) {
      console.error("[databricks-poller] Error:", err);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

// ── PostgreSQL Queue Operations ──────────────────────────────────────

async function claimTask(pool: Pool, workerId: string): Promise<QueueTask | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`
      SELECT id, run_id, prompt_id, agent, prompt_text, prompt_template, prompt_category, prompt_metadata_json
      FROM worker_queue
      WHERE status = 'pending'
      ORDER BY id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const task = rows[0] as QueueTask;
    await client.query(
      "UPDATE worker_queue SET status = 'claimed', claimed_at = NOW(), worker_id = $1 WHERE id = $2",
      [workerId, task.id]
    );
    await client.query("COMMIT");
    return task;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateTask(
  pool: Pool,
  taskId: string,
  update: {
    status: "running" | "completed" | "failed";
    transcript_path?: string;
    cost_usd?: number;
    duration_ms?: number;
    exit_code?: number;
    error?: string;
  },
): Promise<void> {
  const sets: string[] = ["status = $1"];
  const values: unknown[] = [update.status];
  let idx = 2;

  if (update.status === "completed" || update.status === "failed") {
    sets.push(`completed_at = NOW()`);
  }
  if (update.transcript_path !== undefined) {
    sets.push(`transcript_path = $${idx}`);
    values.push(update.transcript_path);
    idx++;
  }
  if (update.cost_usd !== undefined) {
    sets.push(`cost_usd = $${idx}`);
    values.push(update.cost_usd);
    idx++;
  }
  if (update.duration_ms !== undefined) {
    sets.push(`duration_ms = $${idx}`);
    values.push(update.duration_ms);
    idx++;
  }
  if (update.exit_code !== undefined) {
    sets.push(`exit_code = $${idx}`);
    values.push(update.exit_code);
    idx++;
  }
  if (update.error) {
    sets.push(`error = $${idx}`);
    values.push(update.error.slice(0, 1000));
    idx++;
  }

  values.push(taskId);
  await pool.query(
    `UPDATE worker_queue SET ${sets.join(", ")} WHERE id = $${idx}`,
    values
  );
}

// ── Task execution ───────────────────────────────────────────────────

interface TaskResult {
  exitCode: number;
  costUsd: number | null;
  durationMs: number;
  transcriptPath: string | null;
  error?: string;
}

async function runTask(
  dbxConfig: DatabricksConfig | null,
  pool: Pool,
  task: QueueTask,
  workerId: string,
): Promise<TaskResult> {
  const start = Date.now();

  try {
    const template = (task.prompt_template || "node-api") as "node-api" | "next-app";
    const workDir = createWorkspace(task.prompt_id, task.agent, template, task.run_id);

    const adapterResult = await runAdapter(task.agent, task.prompt_text, workDir, task.prompt_id);
    const durationMs = Date.now() - start;

    // Upload transcript and logs to Databricks (best-effort)
    let volumePath: string | null = null;
    if (dbxConfig && adapterResult.transcriptPath) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        volumePath = `/Volumes/${dbxConfig.catalog}/${dbxConfig.volumesSchema}/transcripts/${today}/${task.agent}/${task.prompt_id}.jsonl`;
        const transcriptContent = readFileSync(adapterResult.transcriptPath, "utf-8");
        await uploadTranscript(dbxConfig, volumePath, transcriptContent);
      } catch (err) {
        console.warn(`[databricks-poller] Transcript upload failed (non-fatal):`, err);
        volumePath = null;
      }
    }

    if (dbxConfig) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const logBase = `/Volumes/${dbxConfig.catalog}/${dbxConfig.volumesSchema}/logs/${today}/${task.id}`;
        await Promise.all([
          uploadTranscript(dbxConfig, `${logBase}/stdout.log`, adapterResult.stdout),
          uploadTranscript(dbxConfig, `${logBase}/stderr.log`, adapterResult.stderr),
        ]);
      } catch (err) {
        console.warn(`[databricks-poller] Log upload failed (non-fatal):`, err);
      }
    }

    // Ingest vendor observations from the benchmark transcript (non-fatal)
    try {
      await ingestResults(
        [{
          promptId: task.prompt_id,
          assistant: task.agent as "claude_code" | "codex_cli" | "cursor",
          transcriptPath: adapterResult.transcriptPath,
          stdout: adapterResult.stdout,
          stderr: adapterResult.stderr,
          exitCode: adapterResult.exitCode,
          costUsd: adapterResult.costUsd,
          durationMs,
          startedAt: new Date(start).toISOString(),
          endedAt: new Date().toISOString(),
          error: adapterResult.error,
        }],
        task.run_id,
        pool,
      );
    } catch (err) {
      console.warn(`[databricks-poller] Ingest failed (non-fatal):`, err);
    }

    return {
      exitCode: adapterResult.exitCode,
      costUsd: adapterResult.costUsd,
      durationMs,
      transcriptPath: volumePath,
    };
  } catch (err) {
    if (dbxConfig) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const errorContent = err instanceof Error ? err.stack ?? err.message : String(err);
        const logBase = `/Volumes/${dbxConfig.catalog}/${dbxConfig.volumesSchema}/logs/${today}/${task.id}`;
        await Promise.all([
          uploadTranscript(dbxConfig, `${logBase}/stdout.log`, ""),
          uploadTranscript(dbxConfig, `${logBase}/stderr.log`, errorContent),
        ]);
      } catch {
        // Log upload failed — don't mask the original error
      }
    }

    return {
      exitCode: 1,
      costUsd: 0,
      durationMs: Date.now() - start,
      transcriptPath: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runAdapter(
  agent: string,
  promptText: string,
  workDir: string,
  promptId: string,
): Promise<AdapterResult> {
  const opts = { prompt: promptText, promptId, workDir, budgetUsd: 1, timeoutMs: 300_000 };
  switch (agent) {
    case "claude_code": {
      const { ClaudeCodeAdapter } = await import("@obs/benchmark/adapters/claude-code");
      const adapter = new ClaudeCodeAdapter();
      return adapter.run(opts);
    }
    case "codex_cli": {
      const { CodexCliAdapter } = await import("@obs/benchmark/adapters/codex-cli");
      const adapter = new CodexCliAdapter();
      return adapter.run(opts);
    }
    case "cursor": {
      const { CursorAgentAdapter } = await import("@obs/benchmark/adapters/cursor-agent");
      const adapter = new CursorAgentAdapter();
      return adapter.run(opts);
    }
    default:
      throw new Error(`Unknown agent: ${agent}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
