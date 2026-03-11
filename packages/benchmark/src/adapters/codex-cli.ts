import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
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
      // Snapshot existing session files so we can diff after the run
      const sessionsBefore = getCodexSessionFiles();

      const args = ["exec"];

      // On CI/GitHub Actions, the runner is already externally sandboxed.
      // Use bypass mode so Codex can run commands with full network access.
      // Without this, --full-auto's workspace-write sandbox blocks network,
      // causing the model to produce null responses and exit code 1.
      if (process.env.CI || process.env.GITHUB_ACTIONS) {
        args.push("--dangerously-bypass-approvals-and-sandbox");
      } else {
        args.push("--full-auto");
      }

      if (process.env.CODEX_MODEL) {
        args.push("-m", process.env.CODEX_MODEL);
      }
      args.push("-C", opts.workDir, opts.prompt);

      const { stdout, stderr, exitCode, timedOut } = await spawnWithTimeout("codex", args, {
        cwd: opts.workDir,
        timeout: opts.timeoutMs,
      });

      const endedAt = new Date().toISOString();
      const durationMs = Date.now() - start;

      // Find the new session file created by this run
      const transcriptPath = findNewSessionFile(sessionsBefore);

      // Timeouts that produced output are not errors
      const hasContent = stdout.length > 100;
      const isError = exitCode !== 0 && !hasContent;

      return {
        promptId: opts.promptId,
        assistant: this.name,
        startedAt,
        endedAt,
        exitCode,
        durationMs,
        stdout: stdout.slice(0, 5000),
        stderr: stderr.slice(0, 2000),
        transcriptPath,
        costUsd: null,
        error: isError ? `Exit code ${exitCode}: ${stderr.slice(0, 500)}` : null,
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

/**
 * Recursively collect all .jsonl file paths under ~/.codex/sessions/.
 */
function getCodexSessionFiles(): Set<string> {
  const sessionsDir = join(homedir(), ".codex", "sessions");
  const files = new Set<string>();

  function walk(dir: string): void {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".jsonl")) {
          files.add(full);
        }
      }
    } catch {
      // Directory may not exist yet
    }
  }

  walk(sessionsDir);
  return files;
}

/**
 * Find the new session file that appeared after a run.
 * Falls back to most recently modified .jsonl if multiple new files appear.
 */
function findNewSessionFile(before: Set<string>): string | null {
  const after = getCodexSessionFiles();
  const newFiles = [...after].filter((f) => !before.has(f));

  if (newFiles.length === 1) return newFiles[0];
  if (newFiles.length > 1) {
    // Pick the most recently modified
    return newFiles.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  }
  return null;
}

/**
 * Spawn a process with timeout, capturing stdout/stderr incrementally.
 * Unlike execFile, this captures output even when the process is killed.
 */
function spawnWithTimeout(
  cmd: string,
  args: string[],
  options: { cwd: string; timeout: number },
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let timedOut = false;
    let resolved = false;

    const proc = spawn(cmd, args, {
      cwd: options.cwd,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk.toString());
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!resolved) proc.kill("SIGKILL");
      }, 5000);
    }, options.timeout);

    proc.on("close", (code) => {
      resolved = true;
      clearTimeout(timer);
      resolve({
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        exitCode: code ?? 1,
        timedOut,
      });
    });

    proc.on("error", (err) => {
      resolved = true;
      clearTimeout(timer);
      resolve({
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join("") + "\n" + String(err),
        exitCode: 1,
        timedOut: false,
      });
    });
  });
}
