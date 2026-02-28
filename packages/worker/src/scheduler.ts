import { Pool } from "pg";
import { runDailyBenchmark, markDailyRunFailed } from "./daily-runner.js";

/**
 * Check if the daily benchmark should run, and if so, claim today's run and
 * execute it. Uses INSERT ... ON CONFLICT DO NOTHING on the UNIQUE run_date
 * column for atomic claiming — if two workers check simultaneously, exactly
 * one gets the INSERT and proceeds.
 *
 * Called every ~60 seconds from the main loop.
 */
export async function checkAndScheduleDailyBenchmark(
  pool: Pool,
  workerId: string,
): Promise<void> {
  const now = new Date();
  const utcHour = now.getUTCHours();

  // Don't attempt before 12:00 UTC
  if (utcHour < 12) return;

  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // Try to claim today's run atomically
  const result = await pool.query(`
    INSERT INTO daily_benchmark_runs (run_date, started_at, worker_id, budget_usd)
    VALUES ($1, NOW(), $2, 25.0)
    ON CONFLICT (run_date) DO NOTHING
    RETURNING id
  `, [today, workerId]);

  if (result.rows.length === 0) {
    // Already claimed by this or another worker today
    return;
  }

  const runId: string = result.rows[0].id;
  console.log(`[scheduler] Claimed daily benchmark run for ${today} (id: ${runId})`);

  // Run the benchmark — errors are caught and recorded
  try {
    await runDailyBenchmark(runId, pool);
  } catch (err) {
    await markDailyRunFailed(runId, err, pool);
  }
}
