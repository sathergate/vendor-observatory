import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BenchmarkResult, BenchmarkPrompt } from "@obs/benchmark/lib";

// ── Hoisted mocks (vi.hoisted runs before vi.mock factory) ──────────────

const mocks = vi.hoisted(() => {
  const claudeIsAvailable = vi.fn().mockResolvedValue(true);
  const codexIsAvailable = vi.fn().mockResolvedValue(true);
  const cursorIsAvailable = vi.fn().mockResolvedValue(false);
  const runParallelBatch = vi.fn();
  const ingestResults = vi.fn().mockResolvedValue(undefined);
  const spawnAndWait = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
  const cleanupOldWorkspaces = vi.fn().mockReturnValue(0);

  return {
    claudeIsAvailable,
    codexIsAvailable,
    cursorIsAvailable,
    runParallelBatch,
    ingestResults,
    spawnAndWait,
    cleanupOldWorkspaces,
  };
});

vi.mock("@obs/benchmark/lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@obs/benchmark/lib")>();

  class MockClaudeCodeAdapter {
    name = "claude_code" as const;
    isAvailable = mocks.claudeIsAvailable;
    run = vi.fn();
  }

  class MockCodexCliAdapter {
    name = "codex_cli" as const;
    isAvailable = mocks.codexIsAvailable;
    run = vi.fn();
  }

  class MockCursorAgentAdapter {
    name = "cursor" as const;
    isAvailable = mocks.cursorIsAvailable;
    run = vi.fn();
  }

  const mockPrompts: BenchmarkPrompt[] = [
    { id: "db-01", category: "database", template: "node-api", text: "prompt 1", metadata: { contentTags: [], patternTags: [], constraints: [], existingStack: [], failureMode: null, vendorsNamedInPrompt: [] } },
    { id: "db-02", category: "database", template: "node-api", text: "prompt 2", metadata: { contentTags: [], patternTags: [], constraints: [], existingStack: [], failureMode: null, vendorsNamedInPrompt: [] } },
    { id: "auth-01", category: "auth", template: "next-app", text: "prompt 3", metadata: { contentTags: [], patternTags: [], constraints: [], existingStack: [], failureMode: null, vendorsNamedInPrompt: [] } },
  ];

  return {
    ...actual,
    BENCHMARK_PROMPTS: mockPrompts,
    loadBenchmarkPrompts: vi.fn().mockResolvedValue(mockPrompts),
    ClaudeCodeAdapter: MockClaudeCodeAdapter,
    CodexCliAdapter: MockCodexCliAdapter,
    CursorAgentAdapter: MockCursorAgentAdapter,
    runParallelBatch: mocks.runParallelBatch,
  };
});

vi.mock("./ingest-bridge.js", () => ({
  ingestResults: mocks.ingestResults,
}));

vi.mock("./subprocess.js", () => ({
  spawnAndWait: mocks.spawnAndWait,
}));

vi.mock("./cleanup.js", () => ({
  cleanupOldWorkspaces: mocks.cleanupOldWorkspaces,
}));

import { runDailyBenchmark, markDailyRunFailed } from "./daily-runner.js";

// ── Helpers ──────────────────────────────────────────────────────────────

type QueryCall = { sql: string; params: unknown[] };

function makeResult(
  promptId: string,
  assistant: string,
  costUsd: number | null,
  error: string | null,
): BenchmarkResult {
  return {
    promptId,
    assistant: assistant as BenchmarkResult["assistant"],
    startedAt: "2026-02-28T12:00:00Z",
    endedAt: "2026-02-28T12:01:00Z",
    exitCode: error ? 1 : 0,
    durationMs: 60_000,
    stdout: error ? "" : "some output",
    stderr: error ?? "",
    transcriptPath: null,
    costUsd,
    error,
  };
}

function createMockPool(opts: {
  runRow: Record<string, unknown>;
  costSums?: number[];
}) {
  const queries: QueryCall[] = [];
  let costSumIndex = 0;

  const pool = {
    query: vi.fn((sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });

      if (sql.includes("SELECT run_date")) {
        return { rows: [opts.runRow] };
      }
      if (sql.includes("SUM(cost_usd)")) {
        const total = opts.costSums?.[costSumIndex++] ?? 0;
        return { rows: [{ total }] };
      }
      // CREATE TABLE, CREATE INDEX, INSERT INTO daily_benchmark_logs, etc.
      return { rows: [] };
    }),
  } as unknown as import("pg").Pool;

  return { pool, queries };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("runDailyBenchmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset adapter availability defaults
    mocks.claudeIsAvailable.mockResolvedValue(true);
    mocks.codexIsAvailable.mockResolvedValue(true);
    mocks.cursorIsAvailable.mockResolvedValue(false);
    // Suppress console output during tests
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Ensure Databricks upload is skipped
    delete process.env.DATABRICKS_TOKEN;
    delete process.env.DATABRICKS_HOST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when run ID is not found", async () => {
    const pool = {
      query: vi.fn((sql: string) => {
        if (sql.includes("SELECT run_date")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    } as unknown as import("pg").Pool;

    await expect(runDailyBenchmark("nonexistent", pool)).rejects.toThrow(
      "Run nonexistent not found",
    );
  });

  it("throws when no assistants are available", async () => {
    mocks.claudeIsAvailable.mockResolvedValueOnce(false);
    mocks.codexIsAvailable.mockResolvedValueOnce(false);

    const { pool } = createMockPool({
      runRow: {
        run_date: "2026-02-28",
        budget_usd: 25,
        assistants: ["claude_code", "codex_cli"],
        category: null,
      },
    });

    await expect(runDailyBenchmark("run-1", pool)).rejects.toThrow(
      "No assistants available",
    );
  });

  it("runs prompts in batches and records costs", async () => {
    // 3 prompts × 2 adapters = 6 pairs → 1 batch (BATCH_SIZE=15)
    const batchResults = [
      makeResult("db-01", "claude_code", 0.05, null),
      makeResult("db-01", "codex_cli", null, null),
      makeResult("db-02", "claude_code", 0.08, null),
      makeResult("db-02", "codex_cli", null, null),
      makeResult("auth-01", "claude_code", 0.04, null),
      makeResult("auth-01", "codex_cli", null, "timeout"),
    ];
    mocks.runParallelBatch.mockResolvedValueOnce(batchResults);

    const { pool, queries } = createMockPool({
      runRow: {
        run_date: "2026-02-28",
        budget_usd: 25,
        assistants: ["claude_code", "codex_cli"],
        category: null,
      },
      costSums: [0], // First budget check: $0 spent
    });

    await runDailyBenchmark("run-1", pool);

    // runParallelBatch should be called once (6 pairs < BATCH_SIZE=15)
    expect(mocks.runParallelBatch).toHaveBeenCalledTimes(1);
    const [pairs, opts] = mocks.runParallelBatch.mock.calls[0];
    expect(pairs).toHaveLength(6);
    expect(opts.budgetUsd).toBe(0.30);
    expect(opts.timeoutMs).toBe(120_000);
    expect(opts.jobId).toBe("daily-2026-02-28");

    // Should have INSERT'd into benchmark_costs 6 times (one per result)
    const costInserts = queries.filter(q => q.sql.includes("INSERT INTO benchmark_costs"));
    expect(costInserts).toHaveLength(6);

    // Verify a specific cost record
    const firstInsert = costInserts[0];
    expect(firstInsert.params).toEqual([
      "2026-02-28", "run-1", "db-01", "claude_code", 0.05, 60_000, null,
    ]);

    // Should update daily_benchmark_runs with totals
    const totalUpdates = queries.filter(q =>
      q.sql.includes("UPDATE daily_benchmark_runs") && q.sql.includes("successful")
    );
    expect(totalUpdates.length).toBeGreaterThanOrEqual(1);

    // ingest should be called with all 6 results
    expect(mocks.ingestResults).toHaveBeenCalledWith(batchResults, "daily-2026-02-28", pool);

    // subprocess calls for analyze + digest
    expect(mocks.spawnAndWait).toHaveBeenCalledTimes(2);
  });

  it("stops when budget is exhausted and marks remaining as skipped", async () => {
    // 3 prompts × 1 adapter = 3 pairs
    mocks.codexIsAvailable.mockResolvedValueOnce(false);

    const { pool, queries } = createMockPool({
      runRow: {
        run_date: "2026-02-28",
        budget_usd: 5.0,
        assistants: ["claude_code", "codex_cli"],
        category: null,
      },
      costSums: [6.0], // Already over budget on first check
    });

    await runDailyBenchmark("run-budget", pool);

    // runParallelBatch should NOT have been called — budget check fires first
    expect(mocks.runParallelBatch).not.toHaveBeenCalled();

    // The final UPDATE should record skipped = total pairs (3)
    const finalUpdate = queries
      .filter(q => q.sql.includes("completed_at = NOW()"))
      .pop();
    expect(finalUpdate).toBeDefined();
    // params: [successful, failed, skipped, runId]
    expect(finalUpdate!.params[0]).toBe(0); // successful
    expect(finalUpdate!.params[1]).toBe(0); // failed
    expect(finalUpdate!.params[2]).toBe(3); // skipped = all 3 pairs
  });

  it("filters prompts by category when specified", async () => {
    // Only "database" category → 2 prompts × 2 adapters = 4 pairs
    mocks.runParallelBatch.mockResolvedValueOnce([
      makeResult("db-01", "claude_code", 0.05, null),
      makeResult("db-01", "codex_cli", null, null),
      makeResult("db-02", "claude_code", 0.08, null),
      makeResult("db-02", "codex_cli", null, null),
    ]);

    const { pool } = createMockPool({
      runRow: {
        run_date: "2026-02-28",
        budget_usd: 25,
        assistants: ["claude_code", "codex_cli"],
        category: "database",
      },
      costSums: [0],
    });

    await runDailyBenchmark("run-filtered", pool);

    const [pairs] = mocks.runParallelBatch.mock.calls[0];
    expect(pairs).toHaveLength(4); // 2 database prompts × 2 adapters
    expect(pairs.every(([p]: [BenchmarkPrompt]) => p.category === "database")).toBe(true);
  });

  it("tallies successful and failed results correctly", async () => {
    const results = [
      makeResult("db-01", "claude_code", 0.05, null),
      makeResult("db-01", "codex_cli", null, "crash"),
      makeResult("db-02", "claude_code", null, "timeout"),
      makeResult("db-02", "codex_cli", 0.03, null),
      makeResult("auth-01", "claude_code", 0.04, null),
      makeResult("auth-01", "codex_cli", null, null),
    ];
    mocks.runParallelBatch.mockResolvedValueOnce(results);

    const { pool, queries } = createMockPool({
      runRow: {
        run_date: "2026-02-28",
        budget_usd: 25,
        assistants: ["claude_code", "codex_cli"],
        category: null,
      },
      costSums: [0],
    });

    await runDailyBenchmark("run-tally", pool);

    // Find the final completed_at UPDATE
    const finalUpdate = queries
      .filter(q => q.sql.includes("completed_at = NOW()"))
      .pop();
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate!.params[0]).toBe(4); // 4 successful
    expect(finalUpdate!.params[1]).toBe(2); // 2 failed
    expect(finalUpdate!.params[2]).toBe(0); // 0 skipped
  });

  it("continues when ingest fails", async () => {
    mocks.runParallelBatch.mockResolvedValueOnce([
      makeResult("db-01", "claude_code", 0.05, null),
    ]);
    mocks.ingestResults.mockRejectedValueOnce(new Error("DB down"));

    const { pool, queries } = createMockPool({
      runRow: {
        run_date: "2026-02-28",
        budget_usd: 25,
        assistants: ["claude_code"],
        category: "database",
      },
      costSums: [0],
    });

    // Should NOT throw — ingest failure is non-fatal
    await runDailyBenchmark("run-ingest-fail", pool);

    // Should still mark completed
    const completed = queries.filter(q => q.sql.includes("completed_at = NOW()"));
    expect(completed.length).toBeGreaterThan(0);
  });

  it("continues when subprocess analysis fails", async () => {
    mocks.runParallelBatch.mockResolvedValueOnce([]);
    mocks.spawnAndWait.mockRejectedValueOnce(new Error("spawn fail"));

    const { pool } = createMockPool({
      runRow: {
        run_date: "2026-02-28",
        budget_usd: 25,
        assistants: ["claude_code"],
        category: "database",
      },
      costSums: [0],
    });

    // Should NOT throw
    await runDailyBenchmark("run-analysis-fail", pool);
  });

  it("logs critical events to daily_benchmark_logs table", async () => {
    mocks.runParallelBatch.mockResolvedValueOnce([
      makeResult("db-01", "claude_code", 0.05, null),
      makeResult("db-01", "codex_cli", null, "timeout"),
    ]);

    const { pool, queries } = createMockPool({
      runRow: {
        run_date: "2026-02-28",
        budget_usd: 25,
        assistants: ["claude_code", "codex_cli"],
        category: null,
      },
      costSums: [0],
    });

    await runDailyBenchmark("run-logs", pool);

    // Filter for log INSERT statements
    const logInserts = queries.filter(q => q.sql.includes("INSERT INTO daily_benchmark_logs"));

    // Should have logged at minimum: run_start, config_loaded, session_start×2, pairs_computed,
    // batch_start, session_end (success), session_error (failure), batch_end, ingest_complete,
    // analysis_complete, digest_complete, run_complete
    expect(logInserts.length).toBeGreaterThanOrEqual(8);

    // Verify run_start is logged
    const runStartLog = logInserts.find(q => q.params[1] === "run_start");
    expect(runStartLog).toBeDefined();
    expect(runStartLog!.params[0]).toBe("run-logs"); // run_id

    // Verify run_complete is logged
    const runCompleteLog = logInserts.find(q => q.params[1] === "run_complete");
    expect(runCompleteLog).toBeDefined();

    // Verify session_error is logged for the failed result
    const sessionErrorLog = logInserts.find(q => q.params[1] === "session_error");
    expect(sessionErrorLog).toBeDefined();
    expect(sessionErrorLog!.params[2]).toContain("timeout");

    // Verify session_end is logged for the successful result
    const sessionEndLog = logInserts.find(q => q.params[1] === "session_end");
    expect(sessionEndLog).toBeDefined();
  });

  it("ensures daily_benchmark_logs table is created", async () => {
    mocks.runParallelBatch.mockResolvedValueOnce([]);

    const { pool, queries } = createMockPool({
      runRow: {
        run_date: "2026-02-28",
        budget_usd: 25,
        assistants: ["claude_code"],
        category: "database",
      },
      costSums: [0],
    });

    await runDailyBenchmark("run-table", pool);

    // Should have CREATE TABLE IF NOT EXISTS for daily_benchmark_logs
    const createTable = queries.find(q =>
      q.sql.includes("CREATE TABLE IF NOT EXISTS daily_benchmark_logs"),
    );
    expect(createTable).toBeDefined();
  });
});

describe("markDailyRunFailed", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records the error message and truncates to 2000 chars", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as import("pg").Pool;

    const longError = "x".repeat(3000);
    await markDailyRunFailed("run-err", new Error(longError), pool);

    // Find the UPDATE query (not the log INSERT)
    const updateCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]: [string]) => sql.includes("UPDATE daily_benchmark_runs SET error"),
    );
    expect(updateCall).toBeDefined();
    expect((updateCall![1][0] as string).length).toBe(2000);
    expect(updateCall![1][1]).toBe("run-err");
  });

  it("handles non-Error throwables", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as import("pg").Pool;

    await markDailyRunFailed("run-err", "string error", pool);

    const updateCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]: [string]) => sql.includes("UPDATE daily_benchmark_runs SET error"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1][0]).toBe("string error");
  });

  it("does not throw if the DB update itself fails", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("connection lost")),
    } as unknown as import("pg").Pool;

    // Should not throw
    await markDailyRunFailed("run-err", new Error("original"), pool);
  });

  it("logs run_failed event to daily_benchmark_logs", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as import("pg").Pool;

    await markDailyRunFailed("run-err", new Error("something broke"), pool);

    const logCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]: [string]) => sql.includes("INSERT INTO daily_benchmark_logs"),
    );
    expect(logCall).toBeDefined();
    expect(logCall![1][1]).toBe("run_failed");
    expect(logCall![1][2]).toContain("something broke");
  });
});
