/**
 * Translates Postgres and Supabase error codes into actionable diagnostics.
 *
 * When a Supabase deployment fails, the raw error is often cryptic.
 * This module maps known error codes to explanations, root causes,
 * and concrete next steps — optimized for LLM consumption.
 */

import type { TranslatedError } from "./types.js";

interface ErrorEntry {
  explanation: string;
  actionableStep: string;
  docsUrl?: string;
  commonCauses: string[];
}

// ---------------------------------------------------------------------------
// Postgres error code map (SQLSTATE)
// https://www.postgresql.org/docs/current/errcodes-appendix.html
// ---------------------------------------------------------------------------

const PG_ERRORS: Record<string, ErrorEntry> = {
  "23505": {
    explanation:
      "Unique constraint violation — a row with the same unique key already exists.",
    actionableStep:
      "Check which unique constraint was violated (the error detail will say). Either use ON CONFLICT DO UPDATE/NOTHING, or ensure the value is unique.",
    commonCauses: [
      "Running a migration twice without IF NOT EXISTS",
      "Inserting a duplicate primary key or email",
      "Race condition with concurrent inserts",
    ],
  },
  "23503": {
    explanation:
      "Foreign key constraint violation — the referenced row does not exist.",
    actionableStep:
      "Ensure the referenced row exists in the parent table before inserting. Check your migration order — parent tables must be created and populated first.",
    commonCauses: [
      "Inserting a row that references a nonexistent parent",
      "Deleting a parent row that still has children (add ON DELETE CASCADE if appropriate)",
      "Running migrations out of order",
    ],
  },
  "42P01": {
    explanation: "Undefined table — the table does not exist.",
    actionableStep:
      "Check the table name for typos. If this is a migration, ensure earlier migrations ran successfully. Run list_tables to see what exists.",
    commonCauses: [
      "Typo in table name",
      "Schema prefix missing (public. vs custom schema)",
      "Migration not yet applied",
      "Table was dropped in a previous migration",
    ],
  },
  "42703": {
    explanation: "Undefined column — the column does not exist on this table.",
    actionableStep:
      "Check the column name for typos. Run list_tables with verbose=true to see actual column names.",
    commonCauses: [
      "Typo in column name",
      "Column was renamed in a previous migration",
      "Using snake_case vs camelCase incorrectly",
    ],
  },
  "42P07": {
    explanation: "Duplicate table — the table already exists.",
    actionableStep:
      "Use CREATE TABLE IF NOT EXISTS, or DROP TABLE IF EXISTS first if you want to recreate it.",
    commonCauses: [
      "Running CREATE TABLE migration twice",
      "Missing IF NOT EXISTS clause",
    ],
  },
  "42710": {
    explanation: "Duplicate object — a function, type, or extension already exists.",
    actionableStep:
      "Use CREATE OR REPLACE for functions, or IF NOT EXISTS for extensions and types.",
    commonCauses: [
      "Running CREATE EXTENSION without IF NOT EXISTS",
      "Creating a function that already exists (use CREATE OR REPLACE)",
    ],
  },
  "42501": {
    explanation:
      "Insufficient privilege — you don't have permission for this operation.",
    actionableStep:
      "This usually means RLS is blocking the operation, or the role lacks GRANT permissions. Check your RLS policies and role grants.",
    docsUrl:
      "https://supabase.com/docs/guides/database/postgres/row-level-security",
    commonCauses: [
      "RLS is enabled but no policy grants access for the current role",
      "Trying to modify system tables",
      "Using anon key when authenticated key is required",
      "Missing GRANT on table for the role",
    ],
  },
  "28P01": {
    explanation: "Invalid password — authentication failed.",
    actionableStep:
      "Check your DATABASE_URL connection string. The password may have changed or contain special characters that need URL encoding.",
    commonCauses: [
      "Wrong password in connection string",
      "Special characters in password not URL-encoded",
      "Using the wrong project's credentials",
    ],
  },
  "53300": {
    explanation: "Too many connections — the connection limit has been reached.",
    actionableStep:
      "Use connection pooling (Supabase provides this via port 6543). Ensure your application closes connections properly.",
    docsUrl: "https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler",
    commonCauses: [
      "Not using Supabase's connection pooler (use port 6543)",
      "Connection leak — connections not being closed",
      "Too many serverless function instances opening direct connections",
    ],
  },
  "57014": {
    explanation: "Query cancelled — the statement was cancelled due to timeout.",
    actionableStep:
      "The query took too long. Optimize the query, add appropriate indexes, or increase the statement timeout if appropriate.",
    commonCauses: [
      "Missing index on a frequently queried column",
      "Full table scan on a large table",
      "Complex JOIN without proper indexes",
      "Default statement_timeout is 120s for API requests",
    ],
  },
  "22P02": {
    explanation: "Invalid text representation — e.g. trying to cast an invalid string to UUID.",
    actionableStep:
      "Check the value being inserted/compared. Common issue: passing a non-UUID string where a UUID column is expected.",
    commonCauses: [
      "Passing a regular string to a UUID column",
      "Incorrect date format for a timestamp column",
      "Passing a string to an integer column",
    ],
  },
  "23502": {
    explanation: "NOT NULL violation — a required column has no value.",
    actionableStep:
      "Provide a value for the NOT NULL column, or add a DEFAULT constraint to the column definition.",
    commonCauses: [
      "Missing a required column in INSERT",
      "Column added with NOT NULL but no DEFAULT, and existing rows exist",
      "Application code not setting a required field",
    ],
  },
  "42883": {
    explanation: "Undefined function — the function does not exist with the given argument types.",
    actionableStep:
      "Check the function name and argument types. If it's an extension function (e.g. gen_random_uuid()), ensure the extension is enabled.",
    commonCauses: [
      "Extension not enabled (e.g. pgcrypto for gen_random_uuid())",
      "Wrong argument types passed to function",
      "Function name typo",
    ],
  },
};

// ---------------------------------------------------------------------------
// Supabase-specific error patterns (not SQLSTATE, but API/service errors)
// ---------------------------------------------------------------------------

const SUPABASE_ERRORS: Array<{
  pattern: RegExp;
  entry: ErrorEntry;
}> = [
  {
    pattern: /project.*paused|project.*inactive/i,
    entry: {
      explanation:
        "The Supabase project is paused due to inactivity (free tier projects pause after 1 week of inactivity).",
      actionableStep:
        "Restore the project from the Supabase dashboard or use the restore_project API. The project will take a few minutes to resume.",
      docsUrl: "https://supabase.com/docs/guides/platform/going-into-prod",
      commonCauses: [
        "Free tier project with no activity for 1+ week",
        "Project was manually paused",
      ],
    },
  },
  {
    pattern: /JWT.*expired|token.*expired/i,
    entry: {
      explanation: "The JWT token has expired.",
      actionableStep:
        "Generate a new JWT token. If using Supabase Auth, the client library handles refresh automatically. Check that your system clocks are synchronized.",
      commonCauses: [
        "Token not being refreshed before expiry",
        "System clock skew",
        "Using a static token that has expired",
      ],
    },
  },
  {
    pattern: /edge.*function.*boot/i,
    entry: {
      explanation: "Edge function failed to boot — likely a syntax or import error.",
      actionableStep:
        "Check the function's source for syntax errors and verify all imports resolve. Use get_edge_function to inspect the deployed source.",
      docsUrl: "https://supabase.com/docs/guides/functions/debugging",
      commonCauses: [
        "Syntax error in TypeScript source",
        "Import URL that doesn't resolve",
        "Missing deno.json for npm: imports",
      ],
    },
  },
  {
    pattern: /exceeded.*quota|rate.*limit/i,
    entry: {
      explanation: "API rate limit or quota exceeded.",
      actionableStep:
        "Wait and retry, or upgrade your plan. Check the Supabase dashboard for current usage.",
      docsUrl: "https://supabase.com/docs/guides/platform/going-into-prod#rate-limiting",
      commonCauses: [
        "Too many API requests in a short period",
        "Storage quota exceeded on free tier",
        "Database size limit reached",
      ],
    },
  },
  {
    pattern: /permission\s+denied\s+for\s+schema/i,
    entry: {
      explanation: "The current role lacks permissions on this schema.",
      actionableStep:
        "GRANT USAGE on the schema to the appropriate role, or use the public schema which has default grants.",
      commonCauses: [
        "Creating tables in a custom schema without GRANT USAGE",
        "Using the anon role on a restricted schema",
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function translateError(
  code: string,
  message: string,
): TranslatedError | null {
  // Try SQLSTATE code first
  const pgEntry = PG_ERRORS[code];
  if (pgEntry) {
    return {
      originalCode: code,
      originalMessage: message,
      explanation: pgEntry.explanation,
      actionableStep: pgEntry.actionableStep,
      docsUrl: pgEntry.docsUrl,
      commonCauses: pgEntry.commonCauses,
    };
  }

  // Try pattern matching on the message
  for (const { pattern, entry } of SUPABASE_ERRORS) {
    if (pattern.test(message)) {
      return {
        originalCode: code || "SUPABASE_ERROR",
        originalMessage: message,
        explanation: entry.explanation,
        actionableStep: entry.actionableStep,
        docsUrl: entry.docsUrl,
        commonCauses: entry.commonCauses,
      };
    }
  }

  // Unknown error — still provide structure
  return null;
}

/**
 * Returns all known error codes and their explanations.
 * Useful for documentation or LLM context injection.
 */
export function listKnownErrors(): Array<{
  code: string;
  explanation: string;
}> {
  return Object.entries(PG_ERRORS).map(([code, entry]) => ({
    code,
    explanation: entry.explanation,
  }));
}
