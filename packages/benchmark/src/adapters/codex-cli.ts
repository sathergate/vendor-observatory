import { execFile } from "node:child_process";
import { which } from "../util.js";
import type { AssistantAdapter, RunOptions, BenchmarkResult } from "./types.js";

export class CodexCliAdapter implements AssistantAdapter {
  name = "codex_cli" as const;

  async isAvailable(): Promise<boolean> {
    if (!process.env.OPENAI_API_KEY) return false;
    return (await which("codex")) !== null;
  }

  async run(opts: RunOptions): Promise<BenchmarkResult> {
    const startedAt = new Date().toISOString();
    const start = Date.now();

    try {
      const model = process.env.CODEX_MODEL || "gpt-5.2-codex";
      const { stdout, stderr, exitCode } = await execAsync("codex", [
        "exec",
        "--full-auto",
        "-m", model,
        "-C", opts.workDir,
        opts.prompt,
      ], {
        cwd: opts.workDir,
        timeout: opts.timeoutMs,
      });

      const endedAt = new Date().toISOString();
      const durationMs = Date.now() - start;

      return {
        promptId: opts.promptId,
        assistant: this.name,
        startedAt,
        endedAt,
        exitCode,
        durationMs,
        stdout: stdout.slice(0, 5000),
        stderr: stderr.slice(0, 2000),
        transcriptPath: null, // Codex auto-saves to ~/.codex/sessions/
        costUsd: null,
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
