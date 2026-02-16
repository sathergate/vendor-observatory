import type { SourcePlatform } from "@obs/shared";

export interface BenchmarkResult {
  promptId: string;
  assistant: SourcePlatform;
  startedAt: string;
  endedAt: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  transcriptPath: string | null;
  costUsd: number | null;
  error: string | null;
}

export interface RunOptions {
  prompt: string;
  promptId: string;
  workDir: string;
  budgetUsd: number;
  timeoutMs: number;
}

export interface AssistantAdapter {
  name: SourcePlatform;
  isAvailable(): Promise<boolean>;
  run(opts: RunOptions): Promise<BenchmarkResult>;
}
