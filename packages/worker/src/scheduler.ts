import { Pool } from "pg";
import { runDailyBenchmark, markDailyRunFailed } from "./daily-runner.js";

/**
 * Poll the daily_benchmark_runs table as a work queue. An external cron job
 * inserts rows; the worker just claims and executes them.
 *
 * Uses SELECT FOR UPDATE SKIP LOCKED so multiple workers can safely race
 * to claim the next pending run without conflicts.
 *
 * Called every ~60 seconds from the main loop.
 */
export async function checkAndScheduleDailyBenchmark(
  pool: Pool,
  workerId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find the oldest unclaimed run (started_at IS NULL means not yet picked up)
    const { rows } = await client.query(`
      SELECT id, run_date
      FROM daily_benchmark_runs
      WHERE started_at IS NULL
        AND error IS NULL
      ORDER BY run_date ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return;
    }

    const runId: string = rows[0].id;
    const runDate: string = rows[0].run_date;

    // Claim the run
    await client.query(
      "UPDATE daily_benchmark_runs SET started_at = NOW(), worker_id = $1 WHERE id = $2",
      [workerId, runId],
    );
    await client.query("COMMIT");

    console.log(`[scheduler] Claimed daily benchmark run for ${runDate} (id: ${runId})`);

    // Run the benchmark — errors are caught and recorded
    try {
      await runDailyBenchmark(runId, pool);
    } catch (err) {
      await markDailyRunFailed(runId, err, pool);
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
