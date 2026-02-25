import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AssistantAdapter, BenchmarkResult } from "./adapters/types.js";
import type { BenchmarkPrompt } from "./prompts.js";
import { createWorkspace } from "./workspace.js";

export interface ParallelRunOptions {
  budgetUsd: number;
  timeoutMs: number;
  workspaceRoot?: string;
}

/**
 * Run all prompt × adapter pairs concurrently using Promise.allSettled.
 * Unlike the sequential runner, this maximizes parallelism for time-sensitive
 * onboarding benchmarks.
 */
export async function runParallelBatch(
  pairs: Array<[BenchmarkPrompt, AssistantAdapter]>,
  options: ParallelRunOptions,
): Promise<BenchmarkResult[]> {
  const results = await Promise.allSettled(
    pairs.map(([prompt, adapter]) =>
      runOnePair(prompt, adapter, options)
    ),
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // Create a failure result for rejected promises
    const [prompt, adapter] = pairs[i];
    return {
      promptId: prompt.id,
      assistant: adapter.name,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: String(r.reason),
      transcriptPath: null,
      costUsd: null,
      error: String(r.reason),
    };
  });
}

async function runOnePair(
  prompt: BenchmarkPrompt,
  adapter: AssistantAdapter,
  options: ParallelRunOptions,
): Promise<BenchmarkResult> {
  // Create isolated workspace
  const workDir = createWorkspace(prompt.id, adapter.name, prompt.template);

  // Write prompt metadata sidecar for the ingest pipeline
  try {
    writeFileSync(
      join(workDir, "prompt-metadata.json"),
      JSON.stringify({
        promptId: prompt.id,
        category: prompt.category,
        metadata: prompt.metadata,
      }, null, 2),
    );
  } catch {
    // Non-fatal
  }

  return adapter.run({
    prompt: prompt.text,
    promptId: prompt.id,
    workDir,
    budgetUsd: options.budgetUsd,
    timeoutMs: options.timeoutMs,
  });
}
