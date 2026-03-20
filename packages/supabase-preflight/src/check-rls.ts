/**
 * Pre-flight validation for Supabase Row Level Security policies.
 *
 * RLS is the #1 source of "works locally, broken in production" bugs with
 * Supabase. These checks catch the most common policy mistakes.
 */

import type {
  RlsCheckInput,
  PreflightResult,
  Diagnostic,
  PreflightPlugin,
} from "./types.js";

type CheckFn = (sql: string, input: RlsCheckInput) => Diagnostic[];

const checks: CheckFn[] = [
  checkPermissiveWithoutUsing,
  checkTrueForAll,
  checkMissingWithCheck,
  checkServiceRoleBypass,
  checkPolicyOnNonexistentTable,
  checkAuthUidUsage,
  checkMissingSelectPolicy,
  checkOverlappingPolicies,
];

export function checkRls(
  input: RlsCheckInput,
  plugins: PreflightPlugin[] = [],
): PreflightResult {
  const start = performance.now();
  const diagnostics: Diagnostic[] = [];

  for (const check of checks) {
    diagnostics.push(...check(input.sql, input));
  }

  for (const plugin of plugins) {
    if (plugin.checker === "rls-policy") {
      diagnostics.push(...plugin.analyze(input));
    }
  }

  const durationMs = Math.round(performance.now() - start);
  const hasErrors = diagnostics.some((d) => d.severity === "error");

  return {
    ok: !hasErrors,
    diagnostics,
    durationMs,
    checker: "rls-policy",
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Check implementations
// ---------------------------------------------------------------------------

function checkPermissiveWithoutUsing(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];
  // PERMISSIVE is default, but if USING clause is missing, all rows are visible
  const policyPattern =
    /CREATE\s+POLICY\s+"?(\w+)"?\s+ON\s+(?:\w+\.)?(\w+)\s+([\s\S]*?)(?:;|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = policyPattern.exec(sql)) !== null) {
    const policyName = match[1];
    const body = match[3];

    // SELECT/ALL policies need USING
    if (/\bFOR\s+(?:SELECT|ALL)\b/i.test(body) || !/\bFOR\s+/i.test(body)) {
      if (!/\bUSING\s*\(/i.test(body)) {
        results.push({
          code: "POLICY_MISSING_USING",
          severity: "error",
          message: `Policy "${policyName}" has no USING clause — all rows will be visible.`,
          suggestion:
            "Add a USING clause to restrict which rows are visible, e.g. USING (auth.uid() = user_id)",
          docsUrl:
            "https://supabase.com/docs/guides/database/postgres/row-level-security",
        });
      }
    }
  }
  return results;
}

function checkTrueForAll(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];

  // Detect USING (true) or WITH CHECK (true) — effectively disables RLS
  const truePattern =
    /CREATE\s+POLICY\s+"?(\w+)"?\s+ON\s+(?:\w+\.)?(\w+)[\s\S]*?(?:USING\s*\(\s*true\s*\)|WITH\s+CHECK\s*\(\s*true\s*\))/gi;
  let match: RegExpExecArray | null;

  while ((match = truePattern.exec(sql)) !== null) {
    const policyName = match[1];
    const tableName = match[2];
    results.push({
      code: "RLS_POLICY_TRUE",
      severity: "warning",
      message: `Policy "${policyName}" on "${tableName}" uses USING(true) or WITH CHECK(true) — this allows unrestricted access and effectively disables RLS.`,
      suggestion:
        "If this is intentional (e.g. public read access), add a comment explaining why. Otherwise, restrict with auth.uid() or auth.role().",
    });
  }
  return results;
}

function checkMissingWithCheck(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];

  const policyPattern =
    /CREATE\s+POLICY\s+"?(\w+)"?\s+ON\s+(?:\w+\.)?(\w+)\s+([\s\S]*?)(?:;|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = policyPattern.exec(sql)) !== null) {
    const policyName = match[1];
    const body = match[3];

    // INSERT/UPDATE/ALL policies need WITH CHECK
    if (/\bFOR\s+(?:INSERT|UPDATE|ALL)\b/i.test(body)) {
      if (!/\bWITH\s+CHECK\s*\(/i.test(body)) {
        results.push({
          code: "POLICY_MISSING_WITH_CHECK",
          severity: "warning",
          message: `Policy "${policyName}" for INSERT/UPDATE has no WITH CHECK clause — new/modified rows won't be validated.`,
          suggestion:
            "Add a WITH CHECK clause to validate rows being inserted/updated, e.g. WITH CHECK (auth.uid() = user_id)",
        });
      }
    }
  }
  return results;
}

function checkServiceRoleBypass(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];

  if (/\bservice_role\b/i.test(sql) && /USING|WITH\s+CHECK/i.test(sql)) {
    results.push({
      code: "SERVICE_ROLE_IN_POLICY",
      severity: "info",
      message:
        "Policy references service_role — note that the service_role key bypasses RLS entirely. Policies referencing it are redundant.",
      suggestion:
        "The service_role key always bypasses RLS. Design policies for anon and authenticated roles instead.",
      docsUrl:
        "https://supabase.com/docs/guides/database/postgres/row-level-security#bypassrls",
    });
  }
  return results;
}

function checkPolicyOnNonexistentTable(
  sql: string,
  input: RlsCheckInput,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  if (!input.existingTables) return results;

  const existingNames = new Set(input.existingTables.map((t) => t.name));

  const policyPattern =
    /CREATE\s+POLICY\s+"?\w+"?\s+ON\s+(?:(\w+)\.)?(\w+)/gi;
  let match: RegExpExecArray | null;

  while ((match = policyPattern.exec(sql)) !== null) {
    const tableName = match[2];
    if (!existingNames.has(tableName)) {
      // Check if an ENABLE RLS or CREATE TABLE for this table is in the same SQL
      const createdInSql = new RegExp(
        `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:\\w+\\.)?${tableName}\\b`,
        "i",
      );
      if (!createdInSql.test(sql)) {
        results.push({
          code: "POLICY_ON_MISSING_TABLE",
          severity: "error",
          message: `Policy targets table "${tableName}" which does not exist.`,
          suggestion:
            "Create the table first, or check the table name for typos.",
        });
      }
    }
  }
  return results;
}

function checkAuthUidUsage(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];

  // Detect auth.uid() compared to a column that isn't user_id-like
  // This is a heuristic — we flag when auth.uid() is used but the column name
  // doesn't suggest it's a user identifier
  if (/auth\.uid\(\)/i.test(sql)) {
    // Check if there's a comparison with a non-user-id column
    const compPattern =
      /auth\.uid\(\)\s*=\s*(\w+)|(\w+)\s*=\s*auth\.uid\(\)/gi;
    let compMatch: RegExpExecArray | null;
    while ((compMatch = compPattern.exec(sql)) !== null) {
      const col = compMatch[1] || compMatch[2];
      if (
        col &&
        !/user_id|owner_id|author_id|created_by|uid|owner|author|account_id/i.test(
          col,
        )
      ) {
        results.push({
          code: "AUTH_UID_UNUSUAL_COLUMN",
          severity: "info",
          message: `auth.uid() compared to column "${col}" which doesn't look like a user identifier.`,
          suggestion:
            "Verify this is the correct column. Common patterns: user_id, owner_id, created_by.",
        });
      }
    }
  }
  return results;
}

function checkMissingSelectPolicy(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];

  // If RLS is enabled and INSERT/UPDATE/DELETE policies exist but no SELECT, flag it
  const enablePattern =
    /ALTER\s+TABLE\s+(?:\w+\.)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  let match: RegExpExecArray | null;

  while ((match = enablePattern.exec(sql)) !== null) {
    const tableName = match[1];
    const hasSelect = new RegExp(
      `CREATE\\s+POLICY\\s+"?\\w+"?\\s+ON\\s+(?:\\w+\\.)?${tableName}[\\s\\S]*?FOR\\s+SELECT`,
      "i",
    );
    const hasAll = new RegExp(
      `CREATE\\s+POLICY\\s+"?\\w+"?\\s+ON\\s+(?:\\w+\\.)?${tableName}[\\s\\S]*?FOR\\s+ALL`,
      "i",
    );
    const hasAnyPolicy = new RegExp(
      `CREATE\\s+POLICY\\s+"?\\w+"?\\s+ON\\s+(?:\\w+\\.)?${tableName}`,
      "i",
    );

    if (hasAnyPolicy.test(sql) && !hasSelect.test(sql) && !hasAll.test(sql)) {
      results.push({
        code: "MISSING_SELECT_POLICY",
        severity: "warning",
        message: `Table "${tableName}" has RLS enabled with write policies but no SELECT policy — reads will be denied.`,
        suggestion: `Add a SELECT policy, e.g.: CREATE POLICY "select_own" ON ${tableName} FOR SELECT USING (auth.uid() = user_id);`,
      });
    }
  }
  return results;
}

function checkOverlappingPolicies(sql: string): Diagnostic[] {
  const results: Diagnostic[] = [];

  // Collect all policies per table
  const policyPattern =
    /CREATE\s+POLICY\s+"?(\w+)"?\s+ON\s+(?:\w+\.)?(\w+)\s+[\s\S]*?FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/gi;
  const policiesByTable = new Map<string, Array<{ name: string; op: string }>>();
  let match: RegExpExecArray | null;

  while ((match = policyPattern.exec(sql)) !== null) {
    const policyName = match[1];
    const tableName = match[2];
    const op = match[3].toUpperCase();

    if (!policiesByTable.has(tableName)) {
      policiesByTable.set(tableName, []);
    }
    policiesByTable.get(tableName)!.push({ name: policyName, op });
  }

  for (const [table, policies] of policiesByTable) {
    // Check for multiple policies on the same operation
    const opCounts = new Map<string, string[]>();
    for (const p of policies) {
      const ops = p.op === "ALL" ? ["SELECT", "INSERT", "UPDATE", "DELETE"] : [p.op];
      for (const op of ops) {
        if (!opCounts.has(op)) opCounts.set(op, []);
        opCounts.get(op)!.push(p.name);
      }
    }

    for (const [op, names] of opCounts) {
      if (names.length > 1) {
        results.push({
          code: "OVERLAPPING_POLICIES",
          severity: "info",
          message: `Table "${table}" has ${names.length} PERMISSIVE policies for ${op}: ${names.join(", ")}. Permissive policies are OR'd together.`,
          suggestion:
            "Multiple permissive policies are combined with OR. If you want AND behavior, use RESTRICTIVE policies.",
        });
      }
    }
  }
  return results;
}
