import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { which } from "../util.js";
import type { AssistantAdapter, RunOptions, BenchmarkResult } from "./types.js";

/**
 * Claude Code CLI adapter.
 *
 * Uses `claude --print --output-format stream-json` for non-interactive use.
 * Stream-json emits events as they happen, so even on timeout we capture
 * partial responses. The adapter collects all output and writes a JSONL
 * transcript to ~/.claude/projects/-tmp-obs-bench/.
 */
export class ClaudeCodeAdapter implements AssistantAdapter {
  name = "claude_code" as const;

  async isAvailable(): Promise<boolean> {
    return (await which("claude")) !== null;
  }

  async run(opts: RunOptions): Promise<BenchmarkResult> {
    const startedAt = new Date().toISOString();
    const start = Date.now();
    const sessionId = randomUUID();

    try {
      const { stdout, stderr, exitCode, timedOut } = await spawnWithTimeout("claude", [
        "--print",
        "--verbose",
        "--model", "sonnet",
        "--output-format", "stream-json",
        "--max-budget-usd", String(opts.budgetUsd),
        "--dangerously-skip-permissions",
        opts.prompt,
      ], {
        cwd: opts.workDir,
        timeout: opts.timeoutMs,
      });

      const endedAt = new Date().toISOString();
      const durationMs = Date.now() - start;

      // Parse streamed JSON events to extract assistant content and cost
      const { assistantText, costUsd } = parseStreamJson(stdout);

      // Write transcript so ingest pipeline can find it
      const transcriptPath = this.writeTranscript(
        sessionId, opts, assistantText, startedAt, endedAt,
      );

      // Timeouts that produced content are NOT errors
      const hasContent = assistantText.length > 0;
      const isError = !hasContent && exitCode !== 0;

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
        costUsd,
        error: isError ? `Exit code ${exitCode}` : timedOut ? null : (exitCode !== 0 ? `Exit code ${exitCode}` : null),
      };
    } catch (err) {
      const endedAt = new Date().toISOString();
      const transcriptPath = this.writeTranscript(
        sessionId, opts, `Error: ${String(err)}`, startedAt, endedAt,
      );

      return {
        promptId: opts.promptId,
        assistant: this.name,
        startedAt,
        endedAt,
        exitCode: 1,
        durationMs: Date.now() - start,
        stdout: "",
        stderr: String(err),
        transcriptPath,
        costUsd: null,
        error: String(err),
      };
    }
  }

  /**
   * Write a JSONL transcript to ~/.claude/projects/-tmp-obs-bench/
   * mimicking the format of real Claude Code project transcripts.
   */
  private writeTranscript(
    sessionId: string,
    opts: RunOptions,
    assistantText: string,
    startedAt: string,
    endedAt: string,
  ): string {
    const dir = join(homedir(), ".claude", "projects", "-tmp-obs-bench");
    mkdirSync(dir, { recursive: true });

    const filename = `bench-${opts.promptId}-${sessionId.slice(0, 8)}.jsonl`;
    const filepath = join(dir, filename);

    const lines: string[] = [];

    // Session init (matches Claude Code JSONL format)
    lines.push(JSON.stringify({
      parentUuid: undefined,
      isSidechain: false,
      userType: "external",
      cwd: opts.workDir,
      sessionId,
      version: "benchmark",
      type: "summary",
      timestamp: startedAt,
    }));

    // User message
    lines.push(JSON.stringify({
      parentUuid: sessionId,
      type: "human",
      sessionId,
      timestamp: startedAt,
      message: {
        role: "user",
        content: [{ type: "text", text: opts.prompt }],
      },
    }));

    // Assistant message
    lines.push(JSON.stringify({
      parentUuid: sessionId,
      type: "assistant",
      sessionId,
      timestamp: endedAt,
      message: {
        role: "assistant",
        content: [{ type: "text", text: assistantText }],
      },
    }));

    writeFileSync(filepath, lines.join("\n") + "\n");
    return filepath;
  }
}

/**
 * Parse Claude's stream-json output to extract assistant text and cost.
 */
function parseStreamJson(raw: string): { assistantText: string; costUsd: number | null } {
  const textParts: string[] = [];
  let costUsd: number | null = null;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      // Text content events
      if (event.type === "assistant" && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text) {
            textParts.push(block.text);
          } else if (block.type === "tool_use") {
            textParts.push(`[tool: ${block.name}]`);
          }
        }
      }
      // Content block deltas
      if (event.type === "content_block_delta" && event.delta?.text) {
        textParts.push(event.delta.text);
      }
      // Result events
      if (event.type === "result") {
        if (typeof event.total_cost_usd === "number") costUsd = event.total_cost_usd;
        if (typeof event.cost_usd === "number") costUsd = event.cost_usd;
        if (typeof event.costUsd === "number") costUsd = event.costUsd;
        if (event.result && typeof event.result === "string" && textParts.length === 0) {
          textParts.push(event.result);
        }
      }
    } catch {
      // Plain text line
      if (line.trim()) textParts.push(line.trim());
    }
  }

  return { assistantText: textParts.join("\n"), costUsd };
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
      // Give it 5s to clean up, then force kill
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
