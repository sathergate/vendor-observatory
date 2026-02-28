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

  it("does nothing before 12:00 UTC", async () => {
    // Set clock to 11:59 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-28T11:59:00Z"));

    const pool = createMockPool();
    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    expect(pool.query).not.toHaveBeenCalled();
    expect(runDailyBenchmark).not.toHaveBeenCalled();
  });

  it("attempts to claim after 12:00 UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-28T14:00:00Z"));

    const pool = createMockPool(() => ({ rows: [{ id: "run-uuid-123" }] }));
    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    // Should have issued the INSERT query
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("INSERT INTO daily_benchmark_runs");
    expect(sql).toContain("ON CONFLICT (run_date) DO NOTHING");
    expect(params).toEqual(["2026-02-28", "worker-abc"]);

    // Should have called runDailyBenchmark with the returned id
    expect(runDailyBenchmark).toHaveBeenCalledWith("run-uuid-123", pool);
  });

  it("skips if today's run was already claimed (empty RETURNING)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-28T14:00:00Z"));

    // ON CONFLICT DO NOTHING → empty rows
    const pool = createMockPool(() => ({ rows: [] }));
    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(runDailyBenchmark).not.toHaveBeenCalled();
  });

  it("calls markDailyRunFailed when runDailyBenchmark throws", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-28T14:00:00Z"));

    const pool = createMockPool(() => ({ rows: [{ id: "run-fail-id" }] }));
    const err = new Error("adapter crash");
    vi.mocked(runDailyBenchmark).mockRejectedValueOnce(err);

    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    expect(markDailyRunFailed).toHaveBeenCalledWith("run-fail-id", err, pool);
  });

  it("formats today's date correctly across midnight boundary", async () => {
    vi.useFakeTimers();
    // 2026-03-01 00:30 UTC → should be date "2026-03-01" but hour 0 < 12
    vi.setSystemTime(new Date("2026-03-01T00:30:00Z"));

    const pool = createMockPool();
    await checkAndScheduleDailyBenchmark(pool, "worker-abc");

    // Hour 0 < 12, so no query should be made
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("uses correct date when called at exactly 12:00 UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    const pool = createMockPool(() => ({ rows: [{ id: "noon-run" }] }));
    await checkAndScheduleDailyBenchmark(pool, "worker-xyz");

    const [, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(params[0]).toBe("2026-03-15");
    expect(params[1]).toBe("worker-xyz");
  });
});
