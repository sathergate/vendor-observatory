/**
 * Seed script to create the admin user account.
 *
 * Usage:
 *   npx tsx apps/web/scripts/seed-admin.ts
 *
 * Requires DATABASE_URL to be set.
 */

import { Pool } from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const ADMIN_EMAIL = "james@panopticonos.com";
const ADMIN_PASSWORD = "seneca?94";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    // Ensure users table has isAdmin column
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN DEFAULT FALSE
    `);

    // Check if user already exists
    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [ADMIN_EMAIL],
    );

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    if (existing.rows.length > 0) {
      // Update existing user to admin
      await pool.query(
        `UPDATE users SET "passwordHash" = $1, "isAdmin" = TRUE WHERE email = $2`,
        [passwordHash, ADMIN_EMAIL],
      );
      console.log(`Updated existing user ${ADMIN_EMAIL} to admin.`);
    } else {
      // Create new admin user
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO users (id, email, "emailVerified", "passwordHash", "isAdmin")
         VALUES ($1, $2, NOW(), $3, TRUE)`,
        [id, ADMIN_EMAIL, passwordHash],
      );
      console.log(`Created admin user ${ADMIN_EMAIL} (id: ${id}).`);
    }

    console.log("Done.");
  } catch (err) {
    console.error("Failed to seed admin user:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
