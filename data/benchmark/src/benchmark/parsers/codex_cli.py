"""Codex CLI JSONL transcript parser.

Port of packages/ingest/src/parsers/codex-cli.ts
"""

from __future__ import annotations

import json
import re

from .types import ParsedSession, ParsedTurn, ToolUseRecord, ToolResultRecord


def parse_codex_cli_file(file_path: str) -> list[ParsedSession]:
    """Parse a Codex CLI JSONL transcript file into sessions."""
    with open(file_path, encoding="utf-8") as f:
        raw = f.read()
    return parse_codex_cli_jsonl(raw, file_path)


def parse_codex_cli_jsonl(content: str, file_path: str = "") -> list[ParsedSession]:
    """Parse Codex CLI JSONL content string into sessions."""
    session_id: str | None = None
    cwd: str | None = None
    model_id: str | None = None
    started_at: str | None = None
    ended_at: str | None = None
    turns: list[ParsedTurn] = []

    for line in content.splitlines():
        if not line.strip():
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue

        ts = parsed.get("timestamp", "")
        if ts:
            if not started_at or ts < started_at:
                started_at = ts
            if not ended_at or ts > ended_at:
                ended_at = ts

        line_type = parsed.get("type")
        payload = parsed.get("payload", {})
        if not isinstance(payload, dict):
            payload = {}

        if line_type == "session_meta":
            session_id = payload.get("id")
            cwd = payload.get("cwd")
            model_id = payload.get("model") or payload.get("model_provider")
            if payload.get("timestamp"):
                started_at = payload["timestamp"]
            elif parsed.get("timestamp"):
                started_at = parsed["timestamp"]

        elif line_type == "turn_context":
            if payload.get("model"):
                model_id = payload["model"]
            if payload.get("cwd"):
                cwd = payload["cwd"]

        elif line_type == "response_item":
            payload_type = payload.get("type")

            if payload_type == "message":
                # Skip developer/system messages
                role = payload.get("role")
                if role in ("developer", "system"):
                    continue
                mapped_role = "assistant" if role == "assistant" else "user"

                text_content = ""
                p_content = payload.get("content")
                if isinstance(p_content, list):
                    for block in p_content:
                        if isinstance(block, dict) and block.get("type") in ("output_text", "input_text") and block.get("text"):
                            text_content += block["text"] + "\n"

                if text_content.strip():
                    turns.append(ParsedTurn(
                        role=mapped_role,
                        text_content=text_content.strip(),
                        tool_uses=[],
                        tool_results=[],
                        timestamp=ts,
                    ))

            elif payload_type == "function_call":
                tool_name = payload.get("name", "shell")
                input_data: dict = {}
                args = payload.get("arguments")
                if args:
                    try:
                        input_data = json.loads(args)
                    except (json.JSONDecodeError, TypeError):
                        input_data = {"raw": args}

                call_id = payload.get("call_id", "")
                turns.append(ParsedTurn(
                    role="assistant",
                    text_content="",
                    tool_uses=[ToolUseRecord(tool_name=tool_name, input=input_data, id=call_id)],
                    tool_results=[],
                    timestamp=ts,
                ))

            elif payload_type == "custom_tool_call":
                tool_name = payload.get("name", "custom_tool")
                input_data = {"raw": payload.get("input", "")}
                call_id = payload.get("call_id", "")
                turns.append(ParsedTurn(
                    role="assistant",
                    text_content="",
                    tool_uses=[ToolUseRecord(tool_name=tool_name, input=input_data, id=call_id)],
                    tool_results=[],
                    timestamp=ts,
                ))

            elif payload_type in ("function_call_output", "custom_tool_call_output"):
                call_id = payload.get("call_id", "")
                output = payload.get("output", "")
                is_error = "error" in output.lower() or "failed" in output.lower()
                turns.append(ParsedTurn(
                    role="user",
                    text_content="",
                    tool_uses=[],
                    tool_results=[ToolResultRecord(
                        tool_use_id=call_id,
                        content=output[:1000],
                        is_error=is_error,
                    )],
                    timestamp=ts,
                ))

        elif line_type == "event_msg":
            event = parsed.get("event")
            if event in ("user_message",) or payload.get("type") == "user_message":
                text = (
                    payload.get("message")
                    or payload.get("text")
                    or (payload.get("content", [{}])[0].get("text") if isinstance(payload.get("content"), list) else "")
                    or ""
                )
                if text:
                    turns.append(ParsedTurn(role="user", text_content=text, timestamp=ts))
            elif event in ("agent_message",) or payload.get("type") == "agent_message":
                text = (
                    payload.get("message")
                    or payload.get("text")
                    or (payload.get("content", [{}])[0].get("text") if isinstance(payload.get("content"), list) else "")
                    or ""
                )
                if text:
                    turns.append(ParsedTurn(role="assistant", text_content=text, timestamp=ts))

    if not session_id:
        safe = re.sub(r"[^a-z0-9]", "_", file_path, flags=re.IGNORECASE)[-40:]
        session_id = f"codex_{safe}"

    if not started_at:
        from datetime import datetime, timezone

        started_at = datetime.now(timezone.utc).isoformat()

    sessions: list[ParsedSession] = []
    if turns:
        sessions.append(ParsedSession(
            id=session_id,
            platform="codex_cli",
            model_id=model_id,
            cwd=cwd,
            git_branch=None,
            started_at=started_at,
            ended_at=ended_at,
            turns=turns,
            file_path=file_path,
        ))
    return sessions
