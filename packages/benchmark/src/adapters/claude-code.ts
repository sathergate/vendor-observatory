import { execFile } from "node:child_process";
import { which } from "../util.js";
import type { AssistantAdapter, RunOptions, BenchmarkResult } from "./types.js";

export class ClaudeCodeAdapter implements AssistantAdapter {
  name = "claude_code" as const;

  async isAvailable(): Promise<boolean> {
    return (await which("claude")) !== null;
  }

  async run(opts: RunOptions): Promise<BenchmarkResult> {
    const startedAt = new Date().toISOString();
    const start = Date.now();

    try {
      const { stdout, stderr, exitCode } = await execAsync("claude", [
        "--print",
        "--model", "sonnet",
        "--output-format", "json",
        "--max-budget-usd", String(opts.budgetUsd),
        "--dangerously-skip-permissions",
        opts.prompt,
      ], {
        cwd: opts.workDir,
        timeout: opts.timeoutMs,
      });

      const endedAt = new Date().toISOString();
      const durationMs = Date.now() - start;

      // Try to extract cost from JSON output
      let costUsd: number | null = null;
      try {
        const parsed = JSON.parse(stdout);
        if (typeof parsed.costUsd === "number") costUsd = parsed.costUsd;
        if (typeof parsed.cost_usd === "number") costUsd = parsed.cost_usd;
      } catch {
        // Not JSON or no cost field
      }

      return {
        promptId: opts.promptId,
        assistant: this.name,
        startedAt,
        endedAt,
        exitCode,
        durationMs,
        stdout: stdout.slice(0, 5000),
        stderr: stderr.slice(0, 2000),
        transcriptPath: null, // Claude auto-saves to ~/.claude/projects/
        costUsd,
        error: exitCode !== 0 ? `Exit code ${exitCode}` : null,
      };
    } catch (err) {
      return {
        promptId: opts.promptId,
        assistant: this.name,
        startedAt,
        endedAt: new Date().toISOString(),
        exitCode: 1,
        durationMs: Date.now() - start,
        stdout: "",
        stderr: String(err),
        transcriptPath: null,
        costUsd: null,
        error: String(err),
      };
    }
  }
}

function execAsync(
  cmd: string,
  args: string[],
  options: { cwd: string; timeout: number },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = execFile(cmd, args, {
      cwd: options.cwd,
      timeout: options.timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: "1" },
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        exitCode: error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? 1 : proc.exitCode ?? 0,
      });
    });
  });
}
