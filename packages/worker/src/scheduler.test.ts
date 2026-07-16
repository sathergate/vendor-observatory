import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock daily-runner before importing scheduler
vi.mock("./daily-runner.js", () => ({
  runDailyBenchmark: vi.fn().mockResolvedValue(undefined),
  markDailyRunFailed: vi.fn().mockResolvedValue(undefined),
}));

import { checkAndScheduleDailyBenchmark } from "./scheduler.js";
import { runDailyBenchmark, markDailyRunFailed } from "./daily-runner.js";

// ── Pool mock helper ─────────────────────────────────────────────────────

function createMockPool(queryImpl?: (...args: unknown[]) => unknown) {
  return {
    query: vi.fn(queryImpl ?? (() => ({ rows: [] }))),
  } as unknown as import("pg").Pool;
}

describe("checkAndScheduleDailyBenchmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("claims a pending run and executes it", async () => {
    const pool = createMockPool(() => ({ rows: [{ id: "run-uuid-123", run_date: "2026-02-28" }] }));
    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    // Should have issued the UPDATE query to claim the run
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("UPDATE daily_benchmark_runs");
    expect(sql).toContain("started_at IS NULL");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(params).toEqual(["worker-abc"]);

    // Should have called runDailyBenchmark with the returned id
    expect(runDailyBenchmark).toHaveBeenCalledWith("run-uuid-123", pool);
  });

  it("does nothing when no pending runs exist", async () => {
    // Empty rows = no unclaimed runs
    const pool = createMockPool(() => ({ rows: [] }));
    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(runDailyBenchmark).not.toHaveBeenCalled();
  });

  it("calls markDailyRunFailed when runDailyBenchmark throws", async () => {
    const pool = createMockPool(() => ({ rows: [{ id: "run-fail-id", run_date: "2026-02-28" }] }));
    const err = new Error("adapter crash");
    vi.mocked(runDailyBenchmark).mockRejectedValueOnce(err);

    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    expect(markDailyRunFailed).toHaveBeenCalledWith("run-fail-id", err, pool);
  });

  it("can run at any time of day (no time gate)", async () => {
    // Early morning — should still attempt to claim
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T03:00:00Z"));

    const pool = createMockPool(() => ({ rows: [{ id: "early-run", run_date: "2026-03-01" }] }));
    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(runDailyBenchmark).toHaveBeenCalledWith("early-run", pool);
  });

  it("handles Date objects from pg for run_date", async () => {
    // pg can return DATE columns as JS Date objects
    const pool = createMockPool(() => ({
      rows: [{ id: "date-obj-run", run_date: new Date("2026-03-15T00:00:00Z") }],
    }));

    // Should not throw when run_date is a Date object
    await checkAndScheduleDailyBenchmark(pool, "worker-xyz");

    expect(runDailyBenchmark).toHaveBeenCalledWith("date-obj-run", pool);
  });
});
