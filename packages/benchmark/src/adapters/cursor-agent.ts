import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { which } from "../util.js";
import type { AssistantAdapter, RunOptions, BenchmarkResult } from "./types.js";

/**
 * Cursor Agent CLI adapter.
 *
 * Unlike Claude Code and Codex CLI, Cursor Agent does not write JSONL
 * transcript files to a discoverable location. This adapter captures
 * the stream-json output and writes it to ~/.cursor-obs/sessions/
 * so the ingest pipeline can find and parse it.
 */
export class CursorAgentAdapter implements AssistantAdapter {
  name = "cursor" as const;

  async isAvailable(): Promise<boolean> {
    if ((await which("cursor")) === null) return false;
    // Also need API key for non-interactive use
    return !!process.env.CURSOR_API_KEY;
  }

  async run(opts: RunOptions): Promise<BenchmarkResult> {
    const startedAt = new Date().toISOString();
    const start = Date.now();
    const sessionId = randomUUID();

    try {
      const apiKey = process.env.CURSOR_API_KEY ?? "";
      const { stdout, stderr, exitCode } = await execAsync("cursor", [
        "agent",
        "--print",
        "--api-key", apiKey,
        "--model", "auto",
        "--force",
        "--workspace", opts.workDir,
        "--output-format", "stream-json",
        opts.prompt,
      ], {
        cwd: opts.workDir,
        timeout: opts.timeoutMs,
      });

      const endedAt = new Date().toISOString();
      const durationMs = Date.now() - start;

      // Write transcript to discoverable location
      const transcriptPath = this.writeTranscript(sessionId, opts, stdout, startedAt, endedAt);

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

  /**
   * Write the captured stream-json output to ~/.cursor-obs/sessions/YYYY/MM/DD/
   * as a JSONL file the ingest pipeline can discover.
   */
  private writeTranscript(
    sessionId: string,
    opts: RunOptions,
    rawOutput: string,
    startedAt: string,
    endedAt: string,
  ): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const dir = join(homedir(), ".cursor-obs", "sessions", String(yyyy), mm, dd);
    mkdirSync(dir, { recursive: true });

    const filename = `bench-${opts.promptId}-${sessionId.slice(0, 8)}.jsonl`;
    const filepath = join(dir, filename);

    // Write session metadata line
    const lines: string[] = [];

    lines.push(JSON.stringify({
      type: "session_meta",
      sessionId,
      timestamp: startedAt,
      platform: "cursor",
      promptId: opts.promptId,
      cwd: opts.workDir,
      model: "auto",
    }));

    // Write the user prompt as a user turn
    lines.push(JSON.stringify({
      type: "user",
      sessionId,
      timestamp: startedAt,
      message: {
        role: "user",
        content: opts.prompt,
      },
    }));

    // Parse stream-json output lines into assistant content
    const assistantContent: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }> = [];
    for (const line of rawOutput.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "text" || event.type === "content_block_delta") {
          const text = event.text ?? event.delta?.text ?? "";
          if (text) assistantContent.push({ type: "text", text });
        } else if (event.type === "tool_use" || event.type === "content_block_start") {
          const toolUse = event.content_block ?? event;
          if (toolUse.type === "tool_use") {
            assistantContent.push({
              type: "tool_use",
              name: toolUse.name,
              input: toolUse.input ?? {},
            });
          }
        }
      } catch {
        // Not valid JSON — might be plain text output
        if (line.trim()) {
          assistantContent.push({ type: "text", text: line });
        }
      }
    }

    // If no structured content was parsed, treat the whole output as text
    if (assistantContent.length === 0 && rawOutput.trim()) {
      assistantContent.push({ type: "text", text: rawOutput.trim() });
    }

    lines.push(JSON.stringify({
      type: "assistant",
      sessionId,
      timestamp: endedAt,
      message: {
        role: "assistant",
        content: assistantContent,
      },
    }));

    writeFileSync(filepath, lines.join("\n") + "\n");
    return filepath;
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
