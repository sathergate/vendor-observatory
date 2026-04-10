import { readFileSync } from "node:fs";
import type { ParsedSession, ParsedTurn, ToolUseRecord, ToolResultRecord, SourcePlatform } from "@sathergate/vendor-observatory-shared";

interface CodexContent {
  type: string;
  text?: string;
}

interface CodexPayload {
  type?: string;
  role?: string;
  content?: CodexContent[];
  name?: string;
  arguments?: string;
  call_id?: string;
  output?: string;
  text?: string;
  message?: string;
  input?: string; // custom_tool_call input
  // session_meta / turn_context payload fields
  id?: string;
  timestamp?: string;
  cwd?: string;
  model?: string;
  model_provider?: string;
}

interface CodexLine {
  type: string;
  timestamp?: string;
  payload?: CodexPayload;
  event?: string;
}

/**
 * Parse a Codex CLI JSONL transcript file into sessions.
 */
export function parseCodexCliFile(filePath: string): ParsedSession[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(Boolean);

  let sessionId: string | null = null;
  let cwd: string | null = null;
  let modelId: string | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  const turns: ParsedTurn[] = [];

  for (const line of lines) {
    let parsed: CodexLine;
    try {
      parsed = JSON.parse(line) as CodexLine;
    } catch {
      continue;
    }

    const ts = parsed.timestamp ?? new Date().toISOString();
    if (!startedAt || ts < startedAt) startedAt = ts;
    if (!endedAt || ts > endedAt) endedAt = ts;

    if (parsed.type === "session_meta") {
      const p = parsed.payload;
      sessionId = p?.id ?? null;
      cwd = p?.cwd ?? null;
      modelId = p?.model ?? p?.model_provider ?? null;
      if (p?.timestamp) startedAt = p.timestamp;
      else if (parsed.timestamp) startedAt = parsed.timestamp;
    } else if (parsed.type === "turn_context") {
      const p = parsed.payload;
      if (p?.model) modelId = p.model;
      if (p?.cwd) cwd = p.cwd;
    } else if (parsed.type === "response_item") {
      const payload = parsed.payload;
      if (!payload) continue;

      if (payload.type === "message") {
        // Skip developer/system messages (sandbox permissions, instructions, etc.)
        if (payload.role === "developer" || payload.role === "system") continue;

        const role = payload.role === "assistant" ? "assistant" : "user";
        let textContent = "";

        if (payload.content && Array.isArray(payload.content)) {
          for (const block of payload.content) {
            if ((block.type === "output_text" || block.type === "input_text") && block.text) {
              textContent += block.text + "\n";
            }
          }
        }

        if (textContent.trim()) {
          turns.push({
            role: role as "user" | "assistant",
            textContent: textContent.trim(),
            toolUses: [],
            toolResults: [],
            timestamp: ts,
          });
        }
      } else if (payload.type === "function_call") {
        const toolName = payload.name ?? "shell";
        let input: Record<string, unknown> = {};
        try {
          if (payload.arguments) {
            input = JSON.parse(payload.arguments) as Record<string, unknown>;
          }
        } catch {
          input = { raw: payload.arguments };
        }

        const callId = payload.call_id ?? `call_${Date.now()}`;
        const toolUse: ToolUseRecord = { toolName, input, id: callId };

        turns.push({
          role: "assistant",
          textContent: "",
          toolUses: [toolUse],
          toolResults: [],
          timestamp: ts,
        });
      } else if (payload.type === "custom_tool_call") {
        // Custom tool calls (e.g., apply_patch) — treat like function_call
        const toolName = payload.name ?? "custom_tool";
        const input: Record<string, unknown> = { raw: payload.input ?? "" };
        const callId = payload.call_id ?? `call_${Date.now()}`;
        const toolUse: ToolUseRecord = { toolName, input, id: callId };

        turns.push({
          role: "assistant",
          textContent: "",
          toolUses: [toolUse],
          toolResults: [],
          timestamp: ts,
        });
      } else if (payload.type === "function_call_output" || payload.type === "custom_tool_call_output") {
        const callId = payload.call_id ?? "";
        const output = payload.output ?? "";
        const isError = output.toLowerCase().includes("error") || output.toLowerCase().includes("failed");
        const toolResult: ToolResultRecord = {
          toolUseId: callId,
          content: output.slice(0, 1000),
          isError,
        };

        turns.push({
          role: "user",
          textContent: "",
          toolUses: [],
          toolResults: [toolResult],
          timestamp: ts,
        });
      }
    } else if (parsed.type === "event_msg") {
      const payload = parsed.payload;
      if (!payload) continue;

      if (parsed.event === "user_message" || payload.type === "user_message") {
        const text = payload.message ?? payload.text ?? (payload.content?.[0]?.text) ?? "";
        if (text) {
          turns.push({
            role: "user",
            textContent: text,
            toolUses: [],
            toolResults: [],
            timestamp: ts,
          });
        }
      } else if (parsed.event === "agent_message" || payload.type === "agent_message") {
        const text = payload.message ?? payload.text ?? (payload.content?.[0]?.text) ?? "";
        if (text) {
          turns.push({
            role: "assistant",
            textContent: text,
            toolUses: [],
            toolResults: [],
            timestamp: ts,
          });
        }
      }
    }
  }

  if (!sessionId) {
    sessionId = `codex_${filePath.replace(/[^a-z0-9]/gi, "_").slice(-40)}`;
  }

  if (!startedAt) {
    startedAt = new Date().toISOString();
  }

  const sessions: ParsedSession[] = [];
  if (turns.length > 0) {
    sessions.push({
      id: sessionId,
      platform: "codex_cli" as SourcePlatform,
      modelId,
      cwd,
      gitBranch: null,
      startedAt,
      endedAt,
      turns,
      filePath,
    });
  }

  return sessions;
}
