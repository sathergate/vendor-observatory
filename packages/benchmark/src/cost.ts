import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BenchmarkResult } from "./adapters/types.js";

export interface CostEntry {
  date: string;
  promptId: string;
  assistant: string;
  costUsd: number | null;
  durationMs: number;
  error: string | null;
}

export class CostTracker {
  private logPath: string;
  private totalCost = 0;
  private dailyBudget: number;

  constructor(repoDir: string, dailyBudget: number) {
    this.logPath = resolve(repoDir, "db", "bench-cost.jsonl");
    this.dailyBudget = dailyBudget;
    this.loadTodaysCost();
  }

  /**
   * Load today's already-spent cost from the log file.
   */
  private loadTodaysCost(): void {
    if (!existsSync(this.logPath)) return;

    const today = new Date().toISOString().slice(0, 10);
    const lines = readFileSync(this.logPath, "utf-8").split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as CostEntry;
        if (entry.date === today && entry.costUsd) {
          this.totalCost += entry.costUsd;
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  /**
   * Record a benchmark result and update the running cost.
   */
  record(result: BenchmarkResult): void {
    const entry: CostEntry = {
      date: new Date().toISOString().slice(0, 10),
      promptId: result.promptId,
      assistant: result.assistant,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      error: result.error,
    };

    appendFileSync(this.logPath, JSON.stringify(entry) + "\n");

    if (result.costUsd) {
      this.totalCost += result.costUsd;
    }
  }

  /**
   * Check if the daily budget has been exceeded.
   */
  isOverBudget(): boolean {
    return this.totalCost >= this.dailyBudget;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  getDailyBudget(): number {
    return this.dailyBudget;
  }
}
