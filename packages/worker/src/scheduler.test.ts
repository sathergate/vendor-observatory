import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock daily-runner before importing scheduler
vi.mock("./daily-runner.js", () => ({
  runDailyBenchmark: vi.fn().mockResolvedValue(undefined),
  markDailyRunFailed: vi.fn().mockResolvedValue(undefined),
  ensureBenchmarkLogsTable: vi.fn().mockResolvedValue(undefined),
}));

import { checkAndScheduleDailyBenchmark } from "./scheduler.js";
import { runDailyBenchmark, markDailyRunFailed } from "./daily-runner.js";

// ── Pool mock helper ─────────────────────────────────────────────────────

function createMockPool(opts?: {
  selectRows?: Record<string, unknown>[];
}) {
  const client = {
    query: vi.fn((sql: string, params?: unknown[]) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      if (sql.includes("SELECT id, run_date")) {
        return { rows: opts?.selectRows ?? [] };
      }
      // UPDATE (claim)
      return { rows: [] };
    }),
    release: vi.fn(),
  };

  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn(() => ({ rows: [] })),
  } as unknown as import("pg").Pool;

  return { pool, client };
}

describe("checkAndScheduleDailyBenchmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when no pending runs exist in the queue", async () => {
    const { pool } = createMockPool({ selectRows: [] });
    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    expect(runDailyBenchmark).not.toHaveBeenCalled();
  });

  it("claims and runs a pending benchmark from the queue", async () => {
    const { pool, client } = createMockPool({
      selectRows: [{ id: "run-uuid-123", run_date: "2026-02-28" }],
    });

    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    // Should have issued SELECT FOR UPDATE SKIP LOCKED
    const selectCall = client.query.mock.calls.find(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("SELECT id, run_date"),
    );
    expect(selectCall).toBeDefined();
    expect(selectCall![0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(selectCall![0]).toContain("started_at IS NULL");

    // Should have UPDATE'd to claim
    const updateCall = client.query.mock.calls.find(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("UPDATE daily_benchmark_runs SET started_at"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual(["worker-abc", "run-uuid-123"]);

    // Should have COMMIT'd
    const commitCall = client.query.mock.calls.find(
      ([sql]: [string]) => sql === "COMMIT",
    );
    expect(commitCall).toBeDefined();

    // Should have called runDailyBenchmark with the run id
    expect(runDailyBenchmark).toHaveBeenCalledWith("run-uuid-123", pool);
  });

  it("calls markDailyRunFailed when runDailyBenchmark throws", async () => {
    const { pool } = createMockPool({
      selectRows: [{ id: "run-fail-id", run_date: "2026-02-28" }],
    });
    const err = new Error("adapter crash");
    vi.mocked(runDailyBenchmark).mockRejectedValueOnce(err);

    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    expect(markDailyRunFailed).toHaveBeenCalledWith("run-fail-id", err, pool);
  });

  it("releases the client connection even on error", async () => {
    const { pool, client } = createMockPool({
      selectRows: [{ id: "run-err", run_date: "2026-02-28" }],
    });
    vi.mocked(runDailyBenchmark).mockRejectedValueOnce(new Error("boom"));

    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    expect(client.release).toHaveBeenCalled();
  });

  it("rolls back and releases on claim error", async () => {
    const client = {
      query: vi.fn((sql: string) => {
        if (sql.includes("SELECT id, run_date")) {
          return Promise.reject(new Error("DB connection lost"));
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };

    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as import("pg").Pool;

    await expect(
      checkAndScheduleDailyBenchmark(pool, "worker-abc"),
    ).rejects.toThrow("DB connection lost");

    // Should attempt ROLLBACK
    const rollbackCall = client.query.mock.calls.find(
      ([sql]: [string]) => sql === "ROLLBACK",
    );
    expect(rollbackCall).toBeDefined();

    // Should release client
    expect(client.release).toHaveBeenCalled();
  });

  it("can run at any time of day (no time gate)", async () => {
    vi.useFakeTimers();
    // 03:00 UTC — previously blocked by the 12:00 gate
    vi.setSystemTime(new Date("2026-03-01T03:00:00Z"));

    const { pool } = createMockPool({
      selectRows: [{ id: "early-run", run_date: "2026-03-01" }],
    });

    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    // Should have proceeded and called runDailyBenchmark
    expect(runDailyBenchmark).toHaveBeenCalledWith("early-run", pool);
  });
});
