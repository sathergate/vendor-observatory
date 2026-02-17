import chalk from "chalk";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AssistantAdapter, BenchmarkResult } from "./adapters/types.js";
import type { BenchmarkPrompt } from "./prompts.js";
import { createWorkspace, cleanupOldWorkspaces } from "./workspace.js";
import { CostTracker } from "./cost.js";

export interface RunnerOptions {
  prompts: BenchmarkPrompt[];
  adapters: AssistantAdapter[];
  budgetUsd: number;
  perPromptBudgetUsd: number;
  timeoutMs: number;
  repoDir: string;
}

export interface RunSummary {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  skippedRuns: number;
  totalCostUsd: number;
  totalDurationMs: number;
  results: BenchmarkResult[];
}

export async function runBenchmark(opts: RunnerOptions): Promise<RunSummary> {
  const costTracker = new CostTracker(opts.repoDir, opts.budgetUsd);
  const results: BenchmarkResult[] = [];
  let successfulRuns = 0;
  let failedRuns = 0;
  let skippedRuns = 0;
  const startTime = Date.now();

  // Check which adapters are available
  const availableAdapters: AssistantAdapter[] = [];
  for (const adapter of opts.adapters) {
    const available = await adapter.isAvailable();
    if (available) {
      availableAdapters.push(adapter);
      console.log(chalk.green(`  ✓ ${adapter.name} available`));
    } else {
      console.log(chalk.yellow(`  ✗ ${adapter.name} not found — skipping`));
    }
  }

  if (availableAdapters.length === 0) {
    console.log(chalk.red("\nNo assistants available. Aborting."));
    return { totalRuns: 0, successfulRuns: 0, failedRuns: 0, skippedRuns: 0, totalCostUsd: 0, totalDurationMs: 0, results: [] };
  }

  const totalPrompts = opts.prompts.length;
  const totalRuns = totalPrompts * availableAdapters.length;

  console.log(chalk.blue(`\nRunning ${totalPrompts} prompts × ${availableAdapters.length} assistants = ${totalRuns} benchmark runs\n`));

  // Clean up old workspaces
  const cleaned = cleanupOldWorkspaces();
  if (cleaned > 0) {
    console.log(chalk.gray(`  Cleaned ${cleaned} old workspace directories`));
  }

  let runNumber = 0;

  for (const prompt of opts.prompts) {
    for (const adapter of availableAdapters) {
      runNumber++;

      // Check budget
      if (costTracker.isOverBudget()) {
        console.log(chalk.red(`\n⚠ Daily budget of $${opts.budgetUsd} exceeded ($${costTracker.getTotalCost().toFixed(2)} spent). Stopping.`));
        skippedRuns += totalRuns - runNumber + 1;
        return buildSummary(results, successfulRuns, failedRuns, skippedRuns, costTracker, startTime);
      }

      const label = `[${runNumber}/${totalRuns}] ${prompt.id} → ${adapter.name}`;
      console.log(chalk.blue(`  ${label}...`));

      // Create isolated workspace
      let workDir: string;
      try {
        workDir = createWorkspace(prompt.id, adapter.name, prompt.template);
      } catch (err) {
        console.log(chalk.red(`    ✗ Workspace creation failed: ${err}`));
        failedRuns++;
        continue;
      }

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
        // Non-fatal — enrichment just won't be available for this run
      }

      // Run the prompt
      const result = await adapter.run({
        prompt: prompt.text,
        promptId: prompt.id,
        workDir,
        budgetUsd: opts.perPromptBudgetUsd,
        timeoutMs: opts.timeoutMs,
      });

      results.push(result);
      costTracker.record(result);

      if (result.error) {
        console.log(chalk.red(`    ✗ Failed (${result.durationMs}ms): ${result.error}`));
        failedRuns++;
      } else {
        const costStr = result.costUsd !== null ? ` $${result.costUsd.toFixed(3)}` : "";
        console.log(chalk.green(`    ✓ Done (${result.durationMs}ms)${costStr}`));
        successfulRuns++;
      }
    }
  }

  return buildSummary(results, successfulRuns, failedRuns, skippedRuns, costTracker, startTime);
}

function buildSummary(
  results: BenchmarkResult[],
  successfulRuns: number,
  failedRuns: number,
  skippedRuns: number,
  costTracker: CostTracker,
  startTime: number,
): RunSummary {
  return {
    totalRuns: successfulRuns + failedRuns + skippedRuns,
    successfulRuns,
    failedRuns,
    skippedRuns,
    totalCostUsd: costTracker.getTotalCost(),
    totalDurationMs: Date.now() - startTime,
    results,
  };
}
