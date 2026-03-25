import { describe, it, expect } from "vitest";
import { checkRls } from "./check-rls.js";
import type { RlsCheckInput } from "./types.js";

function check(sql: string, extra?: Partial<RlsCheckInput>) {
  return checkRls({ sql, ...extra });
}

describe("checkRls", () => {
  it("passes a well-formed RLS policy", () => {
    const result = check(`
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "select_own" ON posts FOR SELECT USING (auth.uid() = user_id);
      CREATE POLICY "insert_own" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
    `);
    expect(result.ok).toBe(true);
    expect(result.checker).toBe("rls-policy");
  });

  it("flags policy missing USING clause", () => {
    const result = check(
      'CREATE POLICY "bad" ON posts FOR SELECT;',
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "POLICY_MISSING_USING",
    );
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("error");
  });

  it("flags USING(true)", () => {
    const result = check(
      'CREATE POLICY "public_read" ON posts FOR SELECT USING (true);',
    );
    const diag = result.diagnostics.find((d) => d.code === "RLS_POLICY_TRUE");
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("warning");
  });

  it("flags INSERT policy without WITH CHECK", () => {
    const result = check(
      'CREATE POLICY "insert_all" ON posts FOR INSERT USING (auth.uid() = user_id);',
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "POLICY_MISSING_WITH_CHECK",
    );
    expect(diag).toBeDefined();
  });

  it("flags policy on nonexistent table", () => {
    const result = check(
      'CREATE POLICY "read" ON ghost_table FOR SELECT USING (true);',
      {
        existingTables: [{ schema: "public", name: "posts" }],
      },
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "POLICY_ON_MISSING_TABLE",
    );
    expect(diag).toBeDefined();
  });

  it("flags unusual auth.uid() column comparison", () => {
    const result = check(
      'CREATE POLICY "read" ON posts FOR SELECT USING (auth.uid() = title);',
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "AUTH_UID_UNUSUAL_COLUMN",
    );
    expect(diag).toBeDefined();
    expect(diag!.message).toContain("title");
  });

  it("does not flag auth.uid() = user_id", () => {
    const result = check(
      'CREATE POLICY "read" ON posts FOR SELECT USING (auth.uid() = user_id);',
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "AUTH_UID_UNUSUAL_COLUMN",
    );
    expect(diag).toBeUndefined();
  });

  it("flags missing SELECT policy when write policies exist", () => {
    const result = check(`
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "insert_own" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
    `);
    const diag = result.diagnostics.find(
      (d) => d.code === "MISSING_SELECT_POLICY",
    );
    expect(diag).toBeDefined();
  });

  it("flags overlapping permissive policies", () => {
    const result = check(`
      CREATE POLICY "read_own" ON posts FOR SELECT USING (auth.uid() = user_id);
      CREATE POLICY "read_public" ON posts FOR SELECT USING (published = true);
    `);
    const diag = result.diagnostics.find(
      (d) => d.code === "OVERLAPPING_POLICIES",
    );
    expect(diag).toBeDefined();
    expect(diag!.message).toContain("OR");
  });
});
