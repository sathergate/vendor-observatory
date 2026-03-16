/**
 * Seed admin accounts into the database.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/seed-admins.ts
 *
 * Set ADMIN_PASSWORD env var to choose the password (default: "ChangeMeNow!2024").
 */

import { Pool } from "pg";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const ADMINS = [
  "james@lm-panopticon.com",
  "tom@lm-panopticon.com",
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const password = process.env.ADMIN_PASSWORD ?? "ChangeMeNow!2024";
  const pool = new Pool({ connectionString });

  try {
    // Ensure the users table exists (Auth.js adapter normally creates it)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        "emailVerified" TIMESTAMPTZ,
        image TEXT,
        "passwordHash" TEXT
      )
    `);

    const passwordHash = await bcrypt.hash(password, 10);

    for (const email of ADMINS) {
      const id = crypto.randomUUID();
      const normalized = email.toLowerCase().trim();

      const { rowCount } = await pool.query(
        `INSERT INTO users (id, email, "emailVerified", "passwordHash")
         VALUES ($1, $2, NULL, $3)
         ON CONFLICT (email) DO UPDATE SET "passwordHash" = $3`,
        [id, normalized, passwordHash],
      );

      console.log(`${rowCount ? "Upserted" : "Skipped"} admin: ${normalized}`);
    }

    console.log("\nAdmin accounts ready. Password:", password);
    console.log("Please change the password after first login if using the default.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
