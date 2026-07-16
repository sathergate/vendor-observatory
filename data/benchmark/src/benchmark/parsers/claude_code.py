"""Claude Code JSONL transcript parser.

Port of packages/ingest/src/parsers/claude-code.ts
"""

from __future__ import annotations

import json
from collections import defaultdict

from .types import ParsedSession, ParsedTurn, ToolUseRecord, ToolResultRecord


def parse_claude_code_file(file_path: str) -> list[ParsedSession]:
    """Parse a Claude Code JSONL transcript file into sessions."""
    with open(file_path, encoding="utf-8") as f:
        raw = f.read()

    session_map: dict[str, list[dict]] = defaultdict(list)
    for line in raw.splitlines():
        if not line.strip():
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        sid = parsed.get("sessionId")
        if not sid:
            continue
        session_map[sid].append(parsed)

    sessions: list[ParsedSession] = []
    for session_id, session_lines in session_map.items():
        session = _build_session(session_id, session_lines, file_path)
        if session and session.turns:
            sessions.append(session)
    return sessions


def parse_claude_code_jsonl(content: str, file_path: str = "") -> list[ParsedSession]:
    """Parse Claude Code JSONL content string into sessions."""
    session_map: dict[str, list[dict]] = defaultdict(list)
    for line in content.splitlines():
        if not line.strip():
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        sid = parsed.get("sessionId")
        if not sid:
            continue
        session_map[sid].append(parsed)

    sessions: list[ParsedSession] = []
    for session_id, session_lines in session_map.items():
        session = _build_session(session_id, session_lines, file_path)
        if session and session.turns:
            sessions.append(session)
    return sessions


def _build_session(session_id: str, lines: list[dict], file_path: str) -> ParsedSession | None:
    turns: list[ParsedTurn] = []
    cwd: str | None = None
    git_branch: str | None = None
    model_id: str | None = None
    started_at: str | None = None
    ended_at: str | None = None

    for line in lines:
        if line.get("cwd"):
            cwd = line["cwd"]
        if line.get("gitBranch"):
            git_branch = line["gitBranch"]
        if line.get("model"):
            model_id = line["model"]
        msg = line.get("message", {})
        if isinstance(msg, dict) and msg.get("model"):
            model_id = msg["model"]

        ts = line.get("timestamp", "")
        if ts:
            if not started_at or ts < started_at:
                started_at = ts
            if not ended_at or ts > ended_at:
                ended_at = ts

        line_type = line.get("type")
        if line_type == "user":
            turn = _parse_user_turn(line, ts)
            if turn:
                turns.append(turn)
        elif line_type == "assistant":
            turn = _parse_assistant_turn(line, ts)
            if turn:
                turns.append(turn)

    if not started_at:
        return None

    return ParsedSession(
        id=session_id,
        platform="claude_code",
        model_id=model_id,
        cwd=cwd,
        git_branch=git_branch,
        started_at=started_at,
        ended_at=ended_at,
        turns=turns,
        file_path=file_path,
    )


def _parse_user_turn(line: dict, timestamp: str) -> ParsedTurn | None:
    content = line.get("message", {}).get("content") if isinstance(line.get("message"), dict) else None
    if content is None:
        content = line.get("content")
    if content is None:
        return None

    text_content = ""
    tool_results: list[ToolResultRecord] = []

    if isinstance(content, str):
        text_content = content
    elif isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text" and block.get("text"):
                text_content += block["text"] + "\n"
            elif block.get("type") == "tool_result":
                block_content = block.get("content", "")
                if isinstance(block_content, str):
                    result_text = block_content
                elif isinstance(block_content, list):
                    result_text = "\n".join(
                        b.get("text", "") for b in block_content if isinstance(b, dict) and b.get("type") == "text"
                    )
                else:
                    result_text = ""
                tool_results.append(
                    ToolResultRecord(
                        tool_use_id=block.get("tool_use_id", ""),
                        content=result_text[:1000],
                        is_error=block.get("is_error", False),
                    )
                )

    return ParsedTurn(
        role="user",
        text_content=text_content.strip(),
        tool_uses=[],
        tool_results=tool_results,
        timestamp=timestamp,
    )


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
