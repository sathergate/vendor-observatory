"""Cursor Agent JSONL transcript parser.

Port of packages/ingest/src/parsers/cursor-agent.ts
"""

from __future__ import annotations

import json

from .types import ParsedSession, ParsedTurn, ToolUseRecord


def parse_cursor_agent_file(file_path: str) -> list[ParsedSession]:
    """Parse a Cursor Agent JSONL transcript file into sessions."""
    with open(file_path, encoding="utf-8") as f:
        raw = f.read()
    return parse_cursor_agent_jsonl(raw, file_path)


def parse_cursor_agent_jsonl(content: str, file_path: str = "") -> list[ParsedSession]:
    """Parse Cursor Agent JSONL content string into sessions."""
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
        line_type = parsed.get("type")

        if line_type == "session_meta":
            session_id = parsed.get("sessionId")
            cwd = parsed.get("cwd")
            model_id = parsed.get("model")
            if not started_at:
                started_at = ts
            continue

        if ts:
            if not started_at or ts < started_at:
                started_at = ts
            if not ended_at or ts > ended_at:
                ended_at = ts

        if parsed.get("sessionId") and not session_id:
            session_id = parsed["sessionId"]

        if line_type == "user":
            turn = _parse_user_turn(parsed, ts)
            if turn:
                turns.append(turn)
        elif line_type == "assistant":
            turn = _parse_assistant_turn(parsed, ts)
            if turn:
                turns.append(turn)

    if not session_id or not turns:
        return []

    from datetime import datetime, timezone

    return [
        ParsedSession(
            id=session_id,
            platform="cursor",
            model_id=model_id,
            cwd=cwd,
            git_branch="__obs_bench__",
            started_at=started_at or datetime.now(timezone.utc).isoformat(),
            ended_at=ended_at,
            turns=turns,
            file_path=file_path,
        )
    ]


def _parse_user_turn(line: dict, timestamp: str) -> ParsedTurn | None:
    msg = line.get("message")
    if not isinstance(msg, dict):
        return None
    content = msg.get("content")
    if content is None:
        return None

    if isinstance(content, str):
        text_content = content
    elif isinstance(content, list):
        text_content = "\n".join(
            b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text" and b.get("text")
        )
    else:
        text_content = ""

    return ParsedTurn(role="user", text_content=text_content.strip(), timestamp=timestamp)


def _parse_assistant_turn(line: dict, timestamp: str) -> ParsedTurn | None:
    msg = line.get("message")
    if not isinstance(msg, dict):
        return None
    content = msg.get("content")
    if content is None:
        return None

    text_content = ""
    tool_uses: list[ToolUseRecord] = []

    if isinstance(content, str):
        text_content = content
    elif isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text" and block.get("text"):
                text_content += block["text"] + "\n"
            elif block.get("type") == "tool_use":
                tool_uses.append(
                    ToolUseRecord(
                        tool_name=block.get("name", "unknown"),
                        input=block.get("input", {}),
                        id=block.get("id", ""),
                    )
                )

    return ParsedTurn(
        role="assistant",
        text_content=text_content.strip(),
        tool_uses=tool_uses,
        tool_results=[],
        timestamp=timestamp,
    )
