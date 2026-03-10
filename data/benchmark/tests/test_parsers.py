"""Tests for transcript parsers."""

from __future__ import annotations

from benchmark.parsers.claude_code import parse_claude_code_jsonl
from benchmark.parsers.codex_cli import parse_codex_cli_jsonl
from benchmark.parsers.cursor_agent import parse_cursor_agent_jsonl


def test_claude_code_parser(sample_claude_code_jsonl: str):
    sessions = parse_claude_code_jsonl(sample_claude_code_jsonl, "test.jsonl")
    assert len(sessions) == 1
    s = sessions[0]
    assert s.id == "test-session-1"
    assert s.platform == "claude_code"
    assert len(s.turns) == 3  # user, assistant, user (tool_result)

    # First turn is user text
    assert s.turns[0].role == "user"
    assert "database" in s.turns[0].text_content.lower()

    # Second turn is assistant with tool_use
    assert s.turns[1].role == "assistant"
    assert len(s.turns[1].tool_uses) == 1
    assert s.turns[1].tool_uses[0].tool_name == "Bash"
    assert "supabase" in s.turns[1].tool_uses[0].input.get("command", "").lower()

    # Third turn is user with tool_result
    assert s.turns[2].role == "user"
    assert len(s.turns[2].tool_results) == 1


def test_codex_cli_parser(sample_codex_cli_jsonl: str):
    sessions = parse_codex_cli_jsonl(sample_codex_cli_jsonl, "test.jsonl")
    assert len(sessions) == 1
    s = sessions[0]
    assert s.id == "codex-session-1"
    assert s.platform == "codex_cli"
    assert s.model_id == "gpt-4o"
    assert len(s.turns) == 2  # user message + function_call


def test_cursor_agent_parser_empty():
    sessions = parse_cursor_agent_jsonl("", "empty.jsonl")
    assert len(sessions) == 0
