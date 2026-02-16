import { readFileSync } from "node:fs";
import type { ParsedSession, ParsedTurn, ToolUseRecord, ToolResultRecord, SourcePlatform } from "@obs/shared";

/**
 * Cursor Agent transcript format (written by the benchmark adapter):
 *
 * Line 1: { type: "session_meta", sessionId, timestamp, platform, promptId, cwd, model }
 * Line 2: { type: "user", sessionId, timestamp, message: { role: "user", content: "..." } }
 * Line 3: { type: "assistant", sessionId, timestamp, message: { role: "assistant", content: [...] } }
 */

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  id?: string;
}

interface CursorLine {
  type: string;
  sessionId?: string;
  timestamp?: string;
  platform?: string;
  promptId?: string;
  cwd?: string;
  model?: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
  };
}

/**
 * Parse a Cursor Agent JSONL transcript file into sessions.
 */
export function parseCursorAgentFile(filePath: string): ParsedSession[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(Boolean);

  let sessionId: string | null = null;
  let cwd: string | null = null;
  let modelId: string | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  const turns: ParsedTurn[] = [];

  for (const line of lines) {
    let parsed: CursorLine;
    try {
      parsed = JSON.parse(line) as CursorLine;
    } catch {
      continue;
    }

    const ts = parsed.timestamp ?? new Date().toISOString();

    if (parsed.type === "session_meta") {
      sessionId = parsed.sessionId ?? null;
      cwd = parsed.cwd ?? null;
      modelId = parsed.model ?? null;
      if (!startedAt) startedAt = ts;
      continue;
    }

    if (!startedAt || ts < startedAt) startedAt = ts;
    if (!endedAt || ts > endedAt) endedAt = ts;

    if (parsed.sessionId && !sessionId) sessionId = parsed.sessionId;

    if (parsed.type === "user") {
      const turn = parseUserTurn(parsed, ts);
      if (turn) turns.push(turn);
    } else if (parsed.type === "assistant") {
      const turn = parseAssistantTurn(parsed, ts);
      if (turn) turns.push(turn);
    }
  }

  if (!sessionId || turns.length === 0) return [];

  return [{
    id: sessionId,
    platform: "cursor" as SourcePlatform,
    modelId,
    cwd,
    gitBranch: "__obs_bench__",
    startedAt: startedAt ?? new Date().toISOString(),
    endedAt,
    turns,
    filePath,
  }];
}

function parseUserTurn(line: CursorLine, timestamp: string): ParsedTurn | null {
  const content = line.message?.content;
  if (!content) return null;

  const textContent = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.filter((b) => b.type === "text" && b.text).map((b) => b.text!).join("\n")
      : "";

  return {
    role: "user",
    textContent: textContent.trim(),
    toolUses: [],
    toolResults: [] as ToolResultRecord[],
    timestamp,
  };
}

function parseAssistantTurn(line: CursorLine, timestamp: string): ParsedTurn | null {
  const content = line.message?.content;
  if (!content) return null;

  let textContent = "";
  const toolUses: ToolUseRecord[] = [];

  if (typeof content === "string") {
    textContent = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text" && block.text) {
        textContent += block.text + "\n";
      } else if (block.type === "tool_use") {
        toolUses.push({
          toolName: block.name ?? "unknown",
          input: (block.input as Record<string, unknown>) ?? {},
          id: block.id ?? "",
        });
      }
    }
  }

  return {
    role: "assistant",
    textContent: textContent.trim(),
    toolUses,
    toolResults: [],
    timestamp,
  };
}
