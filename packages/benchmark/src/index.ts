#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { resolve } from "node:path";
import { BENCHMARK_PROMPTS } from "./prompts.js";
import { ClaudeCodeAdapter } from "./adapters/claude-code.js";
import { CodexCliAdapter } from "./adapters/codex-cli.js";
import { CursorAgentAdapter } from "./adapters/cursor-agent.js";
import { runBenchmark } from "./runner.js";
import type { AssistantAdapter } from "./adapters/types.js";

const program = new Command();

program
  .name("obs-bench")
  .description("Vendor Observatory — automated benchmark runner")
  .version("0.1.0");

program
  .command("run")
  .description("Run the benchmark prompt set across all available assistants")
  .option("--budget <usd>", "Daily budget cap in USD", "25")
  .option("--per-prompt-budget <usd>", "Per-prompt budget in USD", "0.50")
  .option("--timeout <ms>", "Per-prompt timeout in milliseconds", "600000")
  .option("--assistants <list>", "Comma-separated list of assistants to use", "claude_code,codex_cli,cursor")
  .option("--category <category>", "Only run prompts from this category")
  .option("--prompt-id <id>", "Only run a specific prompt by ID")
  .option("--limit <n>", "Limit number of prompts to run")
  .action(async (opts) => {
    console.log(chalk.bold("\n🔬 Vendor Observatory — Benchmark Runner\n"));

    // Parse options
    const budgetUsd = parseFloat(opts.budget);
    const perPromptBudgetUsd = parseFloat(opts.perPromptBudget);
    const timeoutMs = parseInt(opts.timeout, 10);
    const assistantNames = (opts.assistants as string).split(",").map((s: string) => s.trim());

    // Filter prompts
    let prompts = [...BENCHMARK_PROMPTS];
    if (opts.category) {
      prompts = prompts.filter((p) => p.category === opts.category);
    }
    if (opts.promptId) {
      prompts = prompts.filter((p) => p.id === opts.promptId);
    }
    if (opts.limit) {
      prompts = prompts.slice(0, parseInt(opts.limit, 10));
    }

    if (prompts.length === 0) {
      console.log(chalk.red("No prompts match the given filters."));
      process.exit(1);
    }

    console.log(`  Prompts:  ${prompts.length}`);
    console.log(`  Budget:   $${budgetUsd}/day (max $${perPromptBudgetUsd}/prompt)`);
    console.log(`  Timeout:  ${timeoutMs / 1000}s per prompt`);

    // Build adapters
    const allAdapters: AssistantAdapter[] = [
      new ClaudeCodeAdapter(),
      new CodexCliAdapter(),
      new CursorAgentAdapter(),
    ];
    const adapters = allAdapters.filter((a) => assistantNames.includes(a.name));

    console.log(chalk.blue(`\nChecking assistant availability...`));

    // Find repo root
    const repoDir = resolve(process.cwd());

    const summary = await runBenchmark({
      prompts,
      adapters,
      budgetUsd,
      perPromptBudgetUsd,
      timeoutMs,
      repoDir,
    });

    // Print summary
    console.log(chalk.bold("\n═══ Benchmark Summary ═══\n"));
    console.log(`  Total runs:    ${summary.totalRuns}`);
    console.log(chalk.green(`  Successful:    ${summary.successfulRuns}`));
    if (summary.failedRuns > 0) {
      console.log(chalk.red(`  Failed:        ${summary.failedRuns}`));
    }
    if (summary.skippedRuns > 0) {
      console.log(chalk.yellow(`  Skipped:       ${summary.skippedRuns}`));
    }
    console.log(`  Total cost:    $${summary.totalCostUsd.toFixed(2)}`);
    console.log(`  Duration:      ${(summary.totalDurationMs / 1000 / 60).toFixed(1)} minutes`);
    console.log("");
  });

program
  .command("list")
  .description("List all benchmark prompts")
  .option("--category <category>", "Filter by category")
  .action((opts) => {
    let prompts = [...BENCHMARK_PROMPTS];
    if (opts.category) {
      prompts = prompts.filter((p) => p.category === opts.category);
    }

    console.log(chalk.bold("\nBenchmark Prompts\n"));
    console.log(
      chalk.bold(
        "ID".padEnd(12) +
        "Category".padEnd(22) +
        "Template".padEnd(14) +
        "Prompt",
      ),
    );
    console.log("─".repeat(90));
    for (const p of prompts) {
      const truncated = p.text.length > 60 ? p.text.slice(0, 57) + "..." : p.text;
      console.log(
        p.id.padEnd(12) +
        p.category.padEnd(22) +
        p.template.padEnd(14) +
        truncated,
      );
    }
    console.log(`\nTotal: ${prompts.length} prompts`);
  });

program.parse();
