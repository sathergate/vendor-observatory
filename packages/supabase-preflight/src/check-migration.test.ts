import { describe, it, expect } from "vitest";
import { checkMigration } from "./check-migration.js";
import type { MigrationCheckInput } from "./types.js";

function check(sql: string, extra?: Partial<MigrationCheckInput>) {
  return checkMigration({ sql, ...extra });
}

describe("checkMigration", () => {
  it("passes clean migration", () => {
    const result = check(`
      CREATE TABLE IF NOT EXISTS users (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    `);
    expect(result.ok).toBe(true);
    expect(result.checker).toBe("migration-sql");
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("flags CREATE TABLE without IF NOT EXISTS", () => {
    const result = check("CREATE TABLE users (id int);");
    const diag = result.diagnostics.find(
      (d) => d.code === "MISSING_IF_NOT_EXISTS",
    );
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("warning");
  });

  it("flags DROP without IF EXISTS", () => {
    const result = check("DROP TABLE users;");
    const diag = result.diagnostics.find(
      (d) => d.code === "DROP_WITHOUT_IF_EXISTS",
    );
    expect(diag).toBeDefined();
  });

  it("does not flag DROP with IF EXISTS", () => {
    const result = check("DROP TABLE IF EXISTS users;");
    const diag = result.diagnostics.find(
      (d) => d.code === "DROP_WITHOUT_IF_EXISTS",
    );
    expect(diag).toBeUndefined();
  });

  it("flags missing RLS enable on new table", () => {
    const result = check(
      "CREATE TABLE posts (id int PRIMARY KEY, title text);",
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "MISSING_RLS_ENABLE",
    );
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("error");
    expect(result.ok).toBe(false);
  });

  it("does not flag RLS when it's enabled in same migration", () => {
    const result = check(`
      CREATE TABLE posts (id int PRIMARY KEY, title text, created_at timestamptz DEFAULT now());
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
    `);
    const diag = result.diagnostics.find(
      (d) => d.code === "MISSING_RLS_ENABLE",
    );
    expect(diag).toBeUndefined();
  });

  it("flags missing extension when uuid-ossp is needed", () => {
    const result = check(
      "CREATE TABLE IF NOT EXISTS t (id uuid DEFAULT uuid_generate_v4());\nALTER TABLE t ENABLE ROW LEVEL SECURITY;",
      { existingExtensions: ["plpgsql"] },
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "MISSING_EXTENSION",
    );
    expect(diag).toBeDefined();
    expect(diag!.message).toContain("uuid-ossp");
  });

  it("does not flag extension when it's already enabled", () => {
    const result = check(
      "CREATE TABLE IF NOT EXISTS t (id uuid DEFAULT uuid_generate_v4(), created_at timestamptz DEFAULT now());\nALTER TABLE t ENABLE ROW LEVEL SECURITY;",
      { existingExtensions: ["uuid-ossp", "plpgsql"] },
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "MISSING_EXTENSION",
    );
    expect(diag).toBeUndefined();
  });

  it("does not flag extension when created in same migration", () => {
    const result = check(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
       CREATE TABLE IF NOT EXISTS t (id uuid DEFAULT uuid_generate_v4(), created_at timestamptz DEFAULT now());
       ALTER TABLE t ENABLE ROW LEVEL SECURITY;`,
      { existingExtensions: [] },
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "MISSING_EXTENSION",
    );
    expect(diag).toBeUndefined();
  });

  it("flags ALTER COLUMN TYPE", () => {
    const result = check(
      "ALTER TABLE users ALTER COLUMN email TYPE varchar(255);",
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "ALTER_COLUMN_TYPE",
    );
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("warning");
  });

  it("flags missing created_at", () => {
    const result = check(
      "CREATE TABLE IF NOT EXISTS logs (id int, message text);\nALTER TABLE logs ENABLE ROW LEVEL SECURITY;",
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "MISSING_CREATED_AT",
    );
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("info");
  });

  it("flags SERIAL usage", () => {
    const result = check(
      "CREATE TABLE IF NOT EXISTS t (id SERIAL PRIMARY KEY, created_at timestamptz DEFAULT now());\nALTER TABLE t ENABLE ROW LEVEL SECURITY;",
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "SERIAL_DEPRECATED",
    );
    expect(diag).toBeDefined();
  });

  it("flags references to nonexistent tables", () => {
    const result = check(
      "CREATE TABLE IF NOT EXISTS posts (id int, author_id int REFERENCES users(id), created_at timestamptz DEFAULT now());\nALTER TABLE posts ENABLE ROW LEVEL SECURITY;",
      {
        existingTables: [
          { schema: "public", name: "posts" },
        ],
      },
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "REFERENCES_MISSING_TABLE",
    );
    expect(diag).toBeDefined();
    expect(diag!.message).toContain("users");
  });

  it("does not flag references when table exists", () => {
    const result = check(
      "CREATE TABLE IF NOT EXISTS posts (id int, author_id int REFERENCES users(id), created_at timestamptz DEFAULT now());\nALTER TABLE posts ENABLE ROW LEVEL SECURITY;",
      {
        existingTables: [
          { schema: "public", name: "users" },
          { schema: "public", name: "posts" },
        ],
      },
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "REFERENCES_MISSING_TABLE",
    );
    expect(diag).toBeUndefined();
  });

  it("flags destructive operations", () => {
    const result = check("TRUNCATE users;");
    const diag = result.diagnostics.find(
      (d) => d.code === "DESTRUCTIVE_OPERATION",
    );
    expect(diag).toBeDefined();
  });

  it("supports plugins", () => {
    const result = checkMigration(
      { sql: "SELECT 1;" },
      [
        {
          id: "test-plugin",
          name: "Test Plugin",
          checker: "migration-sql",
          analyze: () => [
            {
              code: "CUSTOM_CHECK",
              severity: "warning",
              message: "Plugin fired",
              suggestion: "Do something",
            },
          ],
        },
      ],
    );
    const diag = result.diagnostics.find((d) => d.code === "CUSTOM_CHECK");
    expect(diag).toBeDefined();
  });
});
