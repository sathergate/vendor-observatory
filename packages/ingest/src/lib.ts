/**
 * Library exports for @obs/ingest.
 *
 * This module re-exports the core ingest building blocks so that other packages
 * (e.g. the Fly.io worker) can call ingest logic directly as an imported module
 * instead of shelling out to the CLI.
 */

export { ObservatoryDB } from "./db.js";
export { scanForTranscripts, scanAllTranscripts } from "./scanner.js";
export { parseClaudeCodeFile } from "./parsers/claude-code.js";
export { parseCodexCliFile } from "./parsers/codex-cli.js";
export { parseCursorAgentFile } from "./parsers/cursor-agent.js";
