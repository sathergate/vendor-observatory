"""Core transcript data types — Python equivalents of packages/shared/src/types.ts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

SourcePlatform = Literal["claude_code", "codex_cli", "cursor", "copilot"]
Role = Literal["user", "assistant"]


@dataclass
class ToolUseRecord:
    tool_name: str
    input: dict
    id: str = ""


@dataclass
class ToolResultRecord:
    tool_use_id: str
    content: str
    is_error: bool = False


@dataclass
class ParsedTurn:
    role: Role
    text_content: str
    tool_uses: list[ToolUseRecord] = field(default_factory=list)
    tool_results: list[ToolResultRecord] = field(default_factory=list)
    timestamp: str = ""


@dataclass
class ParsedSession:
    id: str
    platform: SourcePlatform
    model_id: str | None = None
    cwd: str | None = None
    git_branch: str | None = None
    started_at: str = ""
    ended_at: str | None = None
    turns: list[ParsedTurn] = field(default_factory=list)
    file_path: str = ""
