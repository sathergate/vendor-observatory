import { Pool } from "pg";
import { runDailyBenchmark, markDailyRunFailed } from "./daily-runner.js";

/**
 * Check if there is a pending daily benchmark to run. The daily_benchmark_runs
 * table is treated as a work queue — rows are inserted by an external cron job,
 * and this function claims the next unclaimed row and executes it.
 *
 * Uses SELECT ... FOR UPDATE SKIP LOCKED for atomic claiming so multiple
 * workers can safely race without double-processing.
 *
 * Called every ~60 seconds from the main loop.
 */
export async function checkAndScheduleDailyBenchmark(
  pool: Pool,
  workerId: string,
): Promise<void> {
  // Try to claim the next pending run atomically
  const result = await pool.query(`
    UPDATE daily_benchmark_runs
    SET started_at = NOW(), worker_id = $1
    WHERE id = (
      SELECT id FROM daily_benchmark_runs
      WHERE started_at IS NULL
      ORDER BY run_date ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, run_date
  `, [workerId]);

  if (result.rows.length === 0) {
    // No pending runs to claim
    return;
  }

  const { id: runId, run_date } = result.rows[0];
  const runDate = typeof run_date === "string" ? run_date : run_date.toISOString().slice(0, 10);
  console.log(`[scheduler] Claimed daily benchmark run for ${runDate} (id: ${runId})`);

  // Run the benchmark — errors are caught and recorded
  try {
    await runDailyBenchmark(runId, pool);
  } catch (err) {
    await markDailyRunFailed(runId, err, pool);
  }
}
