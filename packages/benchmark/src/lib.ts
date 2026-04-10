/**
 * Library exports for @sathergate/vendor-observatory-benchmark.
 *
 * These are used by the worker package to run onboarding benchmarks
 * without going through the CLI entry point.
 */

export { BENCHMARK_PROMPTS, loadBenchmarkPrompts, type BenchmarkPrompt, type TemplateType } from "./prompts.js";
export { selectOnboardingPrompts, selectOnboardingPromptsFromList } from "./prompt-selector.js";
export { runParallelBatch, type ParallelRunOptions } from "./parallel-runner.js";
export { createWorkspace, cleanupOldWorkspaces } from "./workspace.js";
export { ClaudeCodeAdapter } from "./adapters/claude-code.js";
export { CodexCliAdapter } from "./adapters/codex-cli.js";
export { CursorAgentAdapter } from "./adapters/cursor-agent.js";
export type { AssistantAdapter, BenchmarkResult, RunOptions } from "./adapters/types.js";
