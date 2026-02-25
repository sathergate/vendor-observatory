import { createServer } from "node:http";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { executeJob } from "./executor.js";
import { cleanupOldWorkspaces } from "./cleanup.js";

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;
const POLL_INTERVAL_MS = 3000;
const CLEANUP_EVERY_N = 200; // ~10 min at 3s poll

// ── Health check server for Fly.io ─────────────────────────────────

const server = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", worker: WORKER_ID }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = parseInt(process.env.PORT ?? "8080", 10);
server.listen(PORT, () => {
  console.log(`[worker] ${WORKER_ID} health server on :${PORT}`);
});

// ── Database connection ────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[worker] DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

// ── Job claiming ───────────────────────────────────────────────────

interface JobRow {
  id: string;
  url: string;
  domain: string;
  product_name: string | null;
  detected_category: string | null;
  competitors: unknown | null;
  url_analysis_completed_at: string | null;
  fast_completed_at: string | null;
  balanced_completed_at: string | null;
}

async function claimNextJob(): Promise<JobRow | null> {
  const client = await pool.connect();
  try {
    // Use SELECT FOR UPDATE SKIP LOCKED to safely handle multiple workers
    await client.query("BEGIN");
    const { rows } = await client.query(`
      SELECT id, url, domain, product_name, detected_category, competitors,
             url_analysis_completed_at, fast_completed_at, balanced_completed_at
      FROM onboarding_jobs
      WHERE worker_claimed_at IS NULL
        AND error IS NULL
        AND balanced_completed_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const job = rows[0] as JobRow;
    await client.query(
      "UPDATE onboarding_jobs SET worker_claimed_at = NOW(), worker_id = $1 WHERE id = $2",
      [WORKER_ID, job.id]
    );
    await client.query("COMMIT");
    return job;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function markJobFailed(jobId: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  try {
    await pool.query(
      "UPDATE onboarding_jobs SET error = $1 WHERE id = $2",
      [msg.slice(0, 2000), jobId]
    );
  } catch (e) {
    console.error(`[worker] Failed to mark job ${jobId} as failed:`, e);
  }
}

// ── Main polling loop ──────────────────────────────────────────────

async function mainLoop() {
  console.log(`[worker] ${WORKER_ID} starting polling loop`);

  let iteration = 0;

  while (true) {
    // Periodic workspace cleanup
    if (iteration % CLEANUP_EVERY_N === 0) {
      try {
        const cleaned = cleanupOldWorkspaces("/tmp/obs-bench-onboard", 60 * 60 * 1000);
        if (cleaned > 0) {
          console.log(`[worker] Cleaned ${cleaned} old workspace dirs`);
        }
      } catch {
        // Non-fatal
      }
    }
    iteration++;

    try {
      const job = await claimNextJob();
      if (job) {
        console.log(`[worker] Claimed job ${job.id} (domain: ${job.domain})`);
        try {
          await executeJob(job, pool);
          console.log(`[worker] Completed job ${job.id}`);
        } catch (err) {
          console.error(`[worker] Job ${job.id} failed:`, err);
          await markJobFailed(job.id, err);
        }
      } else {
        // No jobs available, sleep before polling again
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error("[worker] Polling error:", err);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start
mainLoop().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
