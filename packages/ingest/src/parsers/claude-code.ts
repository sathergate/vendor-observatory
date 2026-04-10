import { readFileSync } from "node:fs";
import type { ParsedSession, ParsedTurn, ToolUseRecord, ToolResultRecord, SourcePlatform } from "@sathergate/vendor-observatory-shared";

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

interface ClaudeCodeLine {
  type: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  model?: string;
  parentUuid?: string;
  uuid?: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
    model?: string;
  };
  content?: string | ContentBlock[];
  tool_use_id?: string;
  is_error?: boolean;
}

/**
 * Parse a Claude Code JSONL transcript file into sessions.
 */
export function parseClaudeCodeFile(filePath: string): ParsedSession[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(Boolean);

  const sessionMap = new Map<string, ClaudeCodeLine[]>();

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ClaudeCodeLine;
      const sid = parsed.sessionId;
      if (!sid) continue;
      if (!sessionMap.has(sid)) sessionMap.set(sid, []);
      sessionMap.get(sid)!.push(parsed);
    } catch {
      // Skip malformed JSON lines
    }
  }

  const sessions: ParsedSession[] = [];

  for (const [sessionId, sessionLines] of sessionMap) {
    const session = buildSession(sessionId, sessionLines, filePath);
    if (session && session.turns.length > 0) {
      sessions.push(session);
    }
  }

  return sessions;
}

function buildSession(sessionId: string, lines: ClaudeCodeLine[], filePath: string): ParsedSession | null {
  const turns: ParsedTurn[] = [];
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let modelId: string | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;

  for (const line of lines) {
    if (line.cwd) cwd = line.cwd;
    if (line.gitBranch) gitBranch = line.gitBranch;
    if (line.model) modelId = line.model;
    if (line.message?.model) modelId = line.message.model;

    const ts = line.timestamp ?? new Date().toISOString();
    if (!startedAt || ts < startedAt) startedAt = ts;
    if (!endedAt || ts > endedAt) endedAt = ts;

    if (line.type === "user") {
      const turn = parseUserTurn(line, ts);
      if (turn) turns.push(turn);
    } else if (line.type === "assistant") {
      const turn = parseAssistantTurn(line, ts);
      if (turn) turns.push(turn);
    }
  }

  if (!startedAt) return null;

  return {
    id: sessionId,
    platform: "claude_code" as SourcePlatform,
    modelId,
    cwd,
    gitBranch,
    startedAt,
    endedAt,
    turns,
    filePath,
  };
}

function parseUserTurn(line: ClaudeCodeLine, timestamp: string): ParsedTurn | null {
  const content = line.message?.content ?? line.content;
  if (!content) return null;

  let textContent = "";
  const toolResults: ToolResultRecord[] = [];

  if (typeof content === "string") {
    textContent = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text" && block.text) {
        textContent += block.text + "\n";
      } else if (block.type === "tool_result") {
        const resultContent = typeof block.content === "string"
          ? block.content
          : Array.isArray(block.content)
            ? block.content.filter((b: ContentBlock) => b.type === "text").map((b: ContentBlock) => b.text ?? "").join("\n")
            : "";
        toolResults.push({
          toolUseId: block.tool_use_id ?? "",
          content: resultContent.slice(0, 1000),
          isError: block.is_error ?? false,
        });
      }
    }
  }

  return {
    role: "user",
    textContent: textContent.trim(),
    toolUses: [],
    toolResults,
    timestamp,
  };
}

function parseAssistantTurn(line: ClaudeCodeLine, timestamp: string): ParsedTurn | null {
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
