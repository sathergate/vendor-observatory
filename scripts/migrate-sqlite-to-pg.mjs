#!/usr/bin/env node
/**
 * One-shot migration: SQLite → PostgreSQL
 * Uses sqlite3 CLI (macOS built-in) for reading + pg for writing.
 * Run: DATABASE_URL=postgresql://... node scripts/migrate-sqlite-to-pg.mjs
 */

import { execSync } from "node:child_process";
import { createRequire } from "node:module";

// Resolve pg from the ingest package's node_modules
const require = createRequire(
  new URL("../packages/ingest/node_modules/.pnpm", import.meta.url),
);
let pg;
try {
  pg = require("pg");
} catch {
  // fallback: try from apps/web
  const require2 = createRequire(
    new URL("../apps/web/node_modules/.pnpm", import.meta.url),
  );
  pg = require2("pg");
}

const { Pool } = pg;

const SQLITE_PATH = new URL("../db/observatory.sqlite", import.meta.url).pathname;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────

function queryJson(sql) {
  const raw = execSync(`sqlite3 -json "${SQLITE_PATH}" ${JSON.stringify(sql)}`, {
    maxBuffer: 50 * 1024 * 1024,
    encoding: "utf-8",
  });
  if (!raw.trim()) return [];
  return JSON.parse(raw);
}

// ── Migration tables (in FK-safe order) ─────────────────────────────

const TABLES = [
  {
    name: "ingested_files",
    columns: ["file_path", "file_size", "file_mtime", "source_platform", "ingested_at", "session_count"],
  },
  {
    name: "sessions",
    columns: ["id", "source_platform", "model_id", "started_at", "ended_at", "cwd", "git_branch", "turn_count", "file_path", "is_benchmark"],
    booleans: ["is_benchmark"],
  },
  {
    name: "observations",
    columns: ["session_id", "vendor_canonical_id", "vendor_raw", "mention_type", "work_category", "confidence", "context_snippet", "user_prompt_snippet", "timestamp"],
  },
  {
    name: "tool_actions",
    columns: ["session_id", "tool_name", "command_or_path", "vendor_canonical_id", "action_type", "success", "timestamp"],
  },
  {
    name: "prompt_metadata",
    columns: ["prompt_id", "category", "content_tags", "pattern_tags", "constraints", "existing_stack", "failure_mode", "vendors_named_in_prompt"],
  },
  {
    name: "response_context",
    columns: ["session_id", "prompt_id", "primary_vendor", "is_implemented", "rationale_snippet", "vendors_mentioned", "trade_offs_snippet", "gotchas_snippet", "constraints_addressed", "reasoning_chain", "disqualification_reasons", "confidence_score", "extracted_at"],
    booleans: ["is_implemented"],
  },
  {
    name: "prompt_intents",
    columns: ["session_id", "prompt_id", "intent", "confidence", "sub_intent", "classifier", "classified_at"],
  },
  {
    name: "cross_session_insights",
    columns: ["insight_type", "prompt_id", "insight_data", "generated_at"],
  },
  {
    name: "analysis_snapshots",
    columns: ["snapshot_date", "prompt_id", "platform", "primary_vendor", "constraints_addressed"],
  },
  {
    name: "daily_digests",
    columns: ["run_date", "summary", "significant_changes", "alerts", "generated_at"],
  },
];

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  // Verify connection
  try {
    await pool.query("SELECT 1");
    console.log("Connected to PostgreSQL");
  } catch (err) {
    console.error("Failed to connect:", err.message);
    process.exit(1);
  }

  // Create schema by running the ingest init (import and call)
  console.log("\n── Creating schema ──");
  const { ObservatoryDB } = await import("../packages/ingest/dist/db.js");
  const db = await ObservatoryDB.create(DATABASE_URL);
  console.log("Schema created successfully");
  await db.close();

  // Migrate each table
  let totalRows = 0;

  for (const table of TABLES) {
    process.stdout.write(`\n── ${table.name}: `);

    const rows = queryJson(`SELECT * FROM ${table.name}`);
    if (rows.length === 0) {
      console.log("0 rows (empty)");
      continue;
    }

    // Clear existing data in PG for this table (idempotent re-runs)
    await pool.query(`DELETE FROM ${table.name}`);

    // Insert in batches of 100
    const BATCH = 100;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const row of batch) {
          const values = table.columns.map((col) => {
            let val = row[col];
            // Convert SQLite integer booleans to JS booleans
            if (table.booleans?.includes(col)) {
              val = val === 1 || val === true;
            }
            // Convert empty string to null for nullable columns
            if (val === "") val = null;
            return val;
          });
          const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
          await client.query(
            `INSERT INTO ${table.name} (${table.columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values,
          );
        }
        await client.query("COMMIT");
        inserted += batch.length;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`\n  Error in batch: ${err.message}`);
        // Log the first failing row for debugging
        if (batch[0]) console.error("  First row in batch:", JSON.stringify(batch[0]).slice(0, 200));
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`${inserted} rows`);
    totalRows += inserted;
  }

  // Reset sequences (SERIAL columns) to match migrated data
  console.log("\n── Resetting sequences ──");
  const serialTables = [
    "ingested_files", "observations", "tool_actions", "prompt_metadata",
    "response_context", "prompt_intents", "cross_session_insights",
    "analysis_snapshots", "daily_digests",
  ];
  for (const t of serialTables) {
    try {
      await pool.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
    } catch {
      // table might not have a serial id column (e.g., search_index)
    }
  }
  console.log("Sequences reset");

  console.log(`\n── Done! Migrated ${totalRows} total rows ──`);
  await pool.end();
}

main().catch((err) => {
  console.error("\nMigration failed:", err);
  process.exit(1);
});
