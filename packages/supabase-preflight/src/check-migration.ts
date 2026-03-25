/**
 * Pre-flight validation for Supabase migration SQL.
 *
 * Parses SQL text with regex-based heuristics (not a full SQL parser — intentionally)
 * to catch the most common deployment failures before they happen.
 *
 * Philosophy: better to have 20 fast, understandable regex checks than one
 * slow, opaque AST parser. False negatives are acceptable; false positives are not.
 */

import type {
  MigrationCheckInput,
  PreflightResult,
  Diagnostic,
  PreflightPlugin,
} from "./types.js";

// ---------------------------------------------------------------------------
// Individual checks — each returns zero or more diagnostics
// ---------------------------------------------------------------------------

type CheckFn = (sql: string, input: MigrationCheckInput) => Diagnostic[];

const checks: CheckFn[] = [
  checkCreateTableWithoutIfNotExists,
  checkDropWithoutIfExists,
  checkDestructiveOperations,
  checkMissingRlsEnable,
  checkReferencedExtensions,
  checkAlterColumnType,
  checkMissingTimestamps,
  checkSerialVsIdentity,
  checkHardcodedIds,
  checkMissingTransaction,
  checkReferencedTables,
];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function checkMigration(
  input: MigrationCheckInput,
  plugins: PreflightPlugin[] = [],
): PreflightResult {
  const start = performance.now();
  const diagnostics: Diagnostic[] = [];

  for (const check of checks) {
    diagnostics.push(...check(input.sql, input));
  }

  // Run any registered plugins for this checker
  for (const plugin of plugins) {
    if (plugin.checker === "migration-sql") {
      diagnostics.push(...plugin.analyze(input));
    }
  }

  const durationMs = Math.round(performance.now() - start);
  const hasErrors = diagnostics.some((d) => d.severity === "error");

  return {
    ok: !hasErrors,
    diagnostics,
    durationMs,
    checker: "migration-sql",
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Check implementations
// ---------------------------------------------------------------------------

function checkCreateTableWithoutIfNotExists(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];
  const pattern = /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    results.push({
      code: "MISSING_IF_NOT_EXISTS",
      severity: "warning",
      message:
        "CREATE TABLE without IF NOT EXISTS — migration will fail if table already exists.",
      suggestion:
        "Add IF NOT EXISTS after CREATE TABLE, or verify the table does not exist.",
      source: sql.slice(match.index, match.index + 60),
      docsUrl:
        "https://supabase.com/docs/guides/database/tables#creating-tables",
    });
  }
  return results;
}

function checkDropWithoutIfExists(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];
  // Match DROP TABLE/INDEX/VIEW/FUNCTION/TRIGGER without IF EXISTS
  const pattern =
    /DROP\s+(TABLE|INDEX|VIEW|FUNCTION|TRIGGER|TYPE|SCHEMA)\s+(?!IF\s+EXISTS)/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    results.push({
      code: "DROP_WITHOUT_IF_EXISTS",
      severity: "warning",
      message: `DROP ${match[1]} without IF EXISTS — will fail if object doesn't exist.`,
      suggestion: `Add IF EXISTS after DROP ${match[1]}.`,
      source: sql.slice(match.index, match.index + 60),
    });
  }
  return results;
}

function checkDestructiveOperations(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];

  const destructive = [
    { pattern: /TRUNCATE\s+/gi, op: "TRUNCATE" },
    {
      pattern: /DROP\s+TABLE\s+(IF\s+EXISTS\s+)?(?!.*_backup)/gi,
      op: "DROP TABLE",
    },
    { pattern: /DELETE\s+FROM\s+\S+\s*;/gi, op: "DELETE without WHERE" },
  ];

  for (const { pattern, op } of destructive) {
    if (pattern.test(sql)) {
      results.push({
        code: "DESTRUCTIVE_OPERATION",
        severity: "warning",
        message: `${op} detected — this is destructive and cannot be undone.`,
        suggestion:
          "Verify this is intentional. Consider backing up data first or using a soft-delete pattern.",
        source: op,
      });
    }
  }
  return results;
}

function checkMissingRlsEnable(
  sql: string,
  input: MigrationCheckInput,
): Diagnostic[] {
  const results: Diagnostic[] = [];

  // Find tables being created
  const createPattern =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)/gi;
  let match: RegExpExecArray | null;

  while ((match = createPattern.exec(sql)) !== null) {
    const tableName = match[2];
    // Check if RLS is enabled anywhere in the same migration
    const rlsPattern = new RegExp(
      `ALTER\\s+TABLE\\s+(?:\\w+\\.)?${tableName}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      "i",
    );
    if (!rlsPattern.test(sql)) {
      results.push({
        code: "MISSING_RLS_ENABLE",
        severity: "error",
        message: `Table "${tableName}" created without enabling Row Level Security.`,
        suggestion: `Add: ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`,
        source: tableName,
        docsUrl: "https://supabase.com/docs/guides/database/postgres/row-level-security",
      });
    }
  }
  return results;
}

function checkReferencedExtensions(
  sql: string,
  input: MigrationCheckInput,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  if (!input.existingExtensions) return results;

  // Common extension-dependent types/functions
  const extensionDeps: Record<string, string> = {
    uuid_generate_v4: "uuid-ossp",
    gen_random_uuid: "pgcrypto",
    "\\buuid\\b": "uuid-ossp",
    citext: "citext",
    hstore: "hstore",
    postgis: "postgis",
    pgvector: "vector",
    "vector\\(": "vector",
    tsvector: "", // built-in, no extension needed
    jsonb_path: "", // built-in
  };

  const enabledSet = new Set(
    input.existingExtensions.map((e) => e.toLowerCase()),
  );

  for (const [pattern, ext] of Object.entries(extensionDeps)) {
    if (!ext) continue; // built-in, skip
    const regex = new RegExp(pattern, "gi");
    if (regex.test(sql) && !enabledSet.has(ext)) {
      // Check if the migration itself creates the extension
      const createExtPattern = new RegExp(
        `CREATE\\s+EXTENSION\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["']?${ext}["']?`,
        "i",
      );
      if (!createExtPattern.test(sql)) {
        results.push({
          code: "MISSING_EXTENSION",
          severity: "error",
          message: `SQL references "${pattern}" which requires the "${ext}" extension, but it's not enabled.`,
          suggestion: `Add: CREATE EXTENSION IF NOT EXISTS "${ext}";`,
          source: pattern,
          docsUrl:
            "https://supabase.com/docs/guides/database/extensions",
        });
      }
    }
  }
  return results;
}

function checkAlterColumnType(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];
  const pattern = /ALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\s+\S+\s+TYPE/gi;

  if (pattern.test(sql)) {
    results.push({
      code: "ALTER_COLUMN_TYPE",
      severity: "warning",
      message:
        "ALTER COLUMN TYPE requires a full table rewrite and exclusive lock. This blocks reads and writes on large tables.",
      suggestion:
        "For large tables, consider adding a new column, backfilling, then swapping. For small tables this is fine.",
    });
  }
  return results;
}

function checkMissingTimestamps(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];
  const createPattern =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)\s*\(([\s\S]*?)\);/gi;
  let match: RegExpExecArray | null;

  while ((match = createPattern.exec(sql)) !== null) {
    const tableName = match[1];
    const body = match[2];

    if (!/created_at|createdat|created_date/i.test(body)) {
      results.push({
        code: "MISSING_CREATED_AT",
        severity: "info",
        message: `Table "${tableName}" has no created_at/timestamp column.`,
        suggestion:
          "Consider adding: created_at timestamptz NOT NULL DEFAULT now()",
      });
    }
  }
  return results;
}

function checkSerialVsIdentity(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];
  if (/\bSERIAL\b/i.test(sql)) {
    results.push({
      code: "SERIAL_DEPRECATED",
      severity: "info",
      message:
        "SERIAL is a legacy pattern. Supabase and modern PostgreSQL prefer GENERATED ALWAYS AS IDENTITY.",
      suggestion:
        "Replace SERIAL with: id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY",
      docsUrl:
        "https://supabase.com/docs/guides/database/tables#creating-tables",
    });
  }
  return results;
}

function checkHardcodedIds(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];
  // Look for UUIDs that are hardcoded in INSERT/UPDATE/VALUES
  const uuidPattern =
    /(?:INSERT|UPDATE|VALUES)[\s\S]*?['"]([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})['"]/gi;

  if (uuidPattern.test(sql)) {
    results.push({
      code: "HARDCODED_UUID",
      severity: "warning",
      message:
        "Hardcoded UUID detected in data migration. This will conflict if the migration runs in different environments.",
      suggestion:
        "Use gen_random_uuid() or a deterministic seed instead of hardcoded UUIDs.",
    });
  }
  return results;
}

function checkMissingTransaction(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];
  // If migration has multiple statements but no explicit BEGIN/COMMIT
  const statements = sql
    .split(";")
    .filter((s) => s.trim().length > 0);
  if (statements.length > 3 && !/\bBEGIN\b/i.test(sql)) {
    results.push({
      code: "NO_EXPLICIT_TRANSACTION",
      severity: "info",
      message:
        "Multi-statement migration without explicit BEGIN/COMMIT. Supabase migrations run in a transaction by default, but being explicit improves clarity.",
      suggestion:
        "Supabase wraps migrations in transactions automatically. This is informational only.",
    });
  }
  return results;
}

function checkReferencedTables(
  sql: string,
  input: MigrationCheckInput,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  if (!input.existingTables) return results;

  const existingNames = new Set(
    input.existingTables.map((t) =>
      t.schema === "public" ? t.name : `${t.schema}.${t.name}`,
    ),
  );
  // Also add just the name for public schema tables
  for (const t of input.existingTables) {
    existingNames.add(t.name);
  }

  // Check REFERENCES clauses
  const refPattern = /REFERENCES\s+(?:(\w+)\.)?(\w+)\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = refPattern.exec(sql)) !== null) {
    const refTable = match[2];
    // Skip if the table is being created in this same migration
    const createdInMigration = new RegExp(
      `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:\\w+\\.)?${refTable}\\b`,
      "i",
    );
    if (!existingNames.has(refTable) && !createdInMigration.test(sql)) {
      results.push({
        code: "REFERENCES_MISSING_TABLE",
        severity: "error",
        message: `Foreign key references table "${refTable}" which does not exist and is not created in this migration.`,
        suggestion: `Verify the table name is correct, or create it before adding the foreign key.`,
        source: refTable,
      });
    }
  }
  return results;
}
