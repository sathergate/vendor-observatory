/**
 * Migration: Create tables for daily benchmark runs on the worker.
 *
 * Tables:
 *   - daily_benchmark_runs: one row per calendar day, tracks overall run state
 *   - benchmark_costs: per-prompt cost/duration records for budget enforcement
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx db/migrate-daily-benchmark.ts
 */

import { Pool } from "pg";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("FATAL: DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── daily_benchmark_runs ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_benchmark_runs (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_date        DATE NOT NULL UNIQUE,
        started_at      TIMESTAMPTZ,
        completed_at    TIMESTAMPTZ,
        worker_id       TEXT,
        budget_usd      FLOAT NOT NULL DEFAULT 25.0,
        assistants      TEXT[] NOT NULL DEFAULT ARRAY['claude_code','codex_cli','cursor'],
        category        TEXT,
        total_pairs     INT,
        successful      INT,
        failed          INT,
        skipped         INT,
        total_cost_usd  FLOAT,
        error           TEXT
      )
    `);
    console.log("✓ Created daily_benchmark_runs table");

    // ── benchmark_costs ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS benchmark_costs (
        id           SERIAL PRIMARY KEY,
        recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        run_date     DATE NOT NULL,
        run_id       UUID REFERENCES daily_benchmark_runs(id),
        prompt_id    TEXT NOT NULL,
        assistant    TEXT NOT NULL,
        cost_usd     FLOAT,
        duration_ms  INT,
        error        TEXT
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS benchmark_costs_run_date ON benchmark_costs(run_date)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS benchmark_costs_run_id ON benchmark_costs(run_id)
    `);

    console.log("✓ Created benchmark_costs table");

    // ── daily_benchmark_logs ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_benchmark_logs (
        id         SERIAL PRIMARY KEY,
        ts         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        run_id     UUID REFERENCES daily_benchmark_runs(id),
        event      TEXT NOT NULL,
        detail     JSONB
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS daily_benchmark_logs_run_id ON daily_benchmark_logs(run_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS daily_benchmark_logs_event ON daily_benchmark_logs(event)
    `);

    console.log("✓ Created daily_benchmark_logs table");

    await client.query("COMMIT");
    console.log("\nMigration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
