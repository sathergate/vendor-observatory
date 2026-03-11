/**
 * Databricks queue poller — polls worker_queue, runs adapters, uploads transcripts.
 *
 * Simple loop:
 * 1. Poll worker_queue for pending tasks
 * 2. Claim one task
 * 3. Run the appropriate adapter (Claude Code / Codex CLI / Cursor Agent)
 * 4. Upload the transcript to UC Volumes
 * 5. Update task status
 *
 * Uses existing adapters from packages/benchmark/src/adapters/ unchanged.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import {
  type DatabricksConfig,
  loadDatabricksConfig,
  claimTask,
  updateTask,
  uploadTranscript,
  triggerJob,
} from "./databricks-client.js";
import { createWorkspace } from "@obs/benchmark/workspace";

// Adapters imported dynamically to avoid hard dependency if packages aren't built
type AdapterResult = {
  exitCode: number;
  costUsd: number;
  durationMs: number;
  transcriptPath: string | null;
};

const POLL_INTERVAL_MS = 5000;
const DATABRICKS_POLL_ENABLED = !!process.env.DATABRICKS_HOST && !!process.env.DATABRICKS_TOKEN;

export async function startDatabricksPoller(workerId: string): Promise<void> {
  if (!DATABRICKS_POLL_ENABLED) {
    console.log("[databricks-poller] Disabled — DATABRICKS_HOST/TOKEN not set");
    return;
  }

  const config = loadDatabricksConfig();
  console.log(`[databricks-poller] ${workerId} starting — polling ${config.host}`);

  while (true) {
    try {
      const task = await claimTask(config, workerId);
      if (!task) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      console.log(`[databricks-poller] Claimed task ${task.id} (${task.agent} × ${task.prompt_id})`);

      // Mark as running
      await updateTask(config, task.id, { status: "running" });

      const result = await runTask(config, task, workerId);

      await updateTask(config, task.id, {
        status: result.error ? "failed" : "completed",
        transcript_path: result.transcriptPath ?? undefined,
        cost_usd: result.costUsd,
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

interface TaskResult {
  exitCode: number;
  costUsd: number;
  durationMs: number;
  transcriptPath: string | null;
  error?: string;
}

async function runTask(
  config: DatabricksConfig,
  task: { id: string; run_id: string; prompt_id: string; agent: string; prompt_text: string; prompt_template: string },
  workerId: string,
): Promise<TaskResult> {
  const start = Date.now();

  try {
    // Create workspace directory
    const template = (task.prompt_template || "node-api") as "node-api" | "next-app";
    const workDir = createWorkspace(task.prompt_id, task.agent, template, task.run_id);

    // Run the adapter
    const adapterResult = await runAdapter(task.agent, task.prompt_text, workDir);
    const durationMs = Date.now() - start;

    // Find and upload the transcript
    let volumePath: string | null = null;
    if (adapterResult.transcriptPath) {
      const today = new Date().toISOString().slice(0, 10);
      volumePath = `/Volumes/${config.catalog}/${config.volumesSchema}/transcripts/${today}/${task.agent}/${task.prompt_id}.jsonl`;

      const transcriptContent = readFileSync(adapterResult.transcriptPath, "utf-8");
      await uploadTranscript(config, volumePath, transcriptContent);
    }

    return {
      exitCode: adapterResult.exitCode,
      costUsd: adapterResult.costUsd,
      durationMs,
      transcriptPath: volumePath,
    };
  } catch (err) {
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
): Promise<AdapterResult> {
  // Dynamic import to avoid hard dependency
  switch (agent) {
    case "claude_code": {
      const { ClaudeCodeAdapter } = await import("@obs/benchmark/adapters/claude-code");
      const adapter = new ClaudeCodeAdapter();
      return adapter.run(promptText, workDir);
    }
    case "codex_cli": {
      const { CodexCliAdapter } = await import("@obs/benchmark/adapters/codex-cli");
      const adapter = new CodexCliAdapter();
      return adapter.run(promptText, workDir);
    }
    case "cursor": {
      const { CursorAgentAdapter } = await import("@obs/benchmark/adapters/cursor-agent");
      const adapter = new CursorAgentAdapter();
      return adapter.run(promptText, workDir);
    }
    default:
      throw new Error(`Unknown agent: ${agent}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
