/**
 * Post-deployment verification.
 *
 * After a deployment completes, verify that the expected state actually exists.
 * This catches silent failures where the deploy reports success but the
 * actual effect is wrong or incomplete.
 */

import type {
  PostDeployVerifyInput,
  PreflightResult,
  Diagnostic,
  PreflightPlugin,
} from "./types.js";

export function verifyDeploy(
  input: PostDeployVerifyInput,
  plugins: PreflightPlugin[] = [],
): PreflightResult {
  const start = performance.now();
  const diagnostics: Diagnostic[] = [];

  switch (input.kind) {
    case "migration":
      diagnostics.push(...verifyMigration(input));
      break;
    case "edge-function":
      diagnostics.push(...verifyEdgeFunction(input));
      break;
    case "rls-policy":
      diagnostics.push(...verifyRlsPolicy(input));
      break;
  }

  for (const plugin of plugins) {
    if (plugin.checker === "post-deploy") {
      diagnostics.push(...plugin.analyze(input));
    }
  }

  const durationMs = Math.round(performance.now() - start);
  const hasErrors = diagnostics.some((d) => d.severity === "error");

  return {
    ok: !hasErrors,
    diagnostics,
    durationMs,
    checker: "post-deploy",
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Migration verification
// ---------------------------------------------------------------------------

function verifyMigration(input: PostDeployVerifyInput): Diagnostic[] {
  const results: Diagnostic[] = [];
  const sql = input.deployedContent;

  if (!input.currentTables) {
    results.push({
      code: "VERIFY_NO_STATE",
      severity: "warning",
      message:
        "Cannot verify migration — no current table state provided. Call list_tables after deploying to enable verification.",
      suggestion:
        "Pass currentTables from list_tables to enable post-deploy verification.",
    });
    return results;
  }

  const existingNames = new Set(input.currentTables.map((t) => t.name));

  // Check that tables referenced in CREATE TABLE now exist
  const createPattern =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)/gi;
  let match: RegExpExecArray | null;

  while ((match = createPattern.exec(sql)) !== null) {
    const tableName = match[1];
    if (!existingNames.has(tableName)) {
      results.push({
        code: "TABLE_NOT_CREATED",
        severity: "error",
        message: `Migration included CREATE TABLE for "${tableName}" but the table does not exist after deployment.`,
        suggestion:
          "The migration may have failed silently. Check the migration logs and verify the SQL is correct.",
      });
    }
  }

  // Check that RLS was actually enabled where expected
  const rlsPattern =
    /ALTER\s+TABLE\s+(?:\w+\.)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  while ((match = rlsPattern.exec(sql)) !== null) {
    const tableName = match[1];
    const tableInfo = input.currentTables.find((t) => t.name === tableName);
    if (tableInfo && tableInfo.rlsEnabled === false) {
      results.push({
        code: "RLS_NOT_ENABLED",
        severity: "error",
        message: `Migration enabled RLS on "${tableName}" but RLS is still disabled after deployment.`,
        suggestion:
          "The ALTER TABLE ENABLE RLS may have failed. Re-run the command manually.",
      });
    }
  }

  if (results.length === 0) {
    results.push({
      code: "MIGRATION_VERIFIED",
      severity: "info",
      message:
        "Post-deploy verification passed — all expected tables and RLS settings confirmed.",
      suggestion: "No action needed.",
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Edge function verification
// ---------------------------------------------------------------------------

function verifyEdgeFunction(input: PostDeployVerifyInput): Diagnostic[] {
  const results: Diagnostic[] = [];

  if (!input.currentEdgeFunctions) {
    results.push({
      code: "VERIFY_NO_STATE",
      severity: "warning",
      message:
        "Cannot verify edge function — no current function list provided. Call list_edge_functions after deploying.",
      suggestion:
        "Pass currentEdgeFunctions from list_edge_functions to enable verification.",
    });
    return results;
  }

  // Extract function name from the deployed content context
  // The function name should be in the input metadata, but we check the list
  const functionNames = new Set(
    input.currentEdgeFunctions.map((f) => f.toLowerCase()),
  );

  // We can't easily extract the function name from source alone,
  // so we just verify the list is non-empty and report status
  if (input.currentEdgeFunctions.length === 0) {
    results.push({
      code: "NO_EDGE_FUNCTIONS",
      severity: "warning",
      message:
        "No edge functions found after deployment. The deploy may have failed.",
      suggestion:
        "Check the deployment logs. Use list_edge_functions to verify.",
    });
  } else {
    results.push({
      code: "EDGE_FUNCTION_VERIFIED",
      severity: "info",
      message: `${input.currentEdgeFunctions.length} edge function(s) found after deployment.`,
      suggestion: "Verify your function is in the list and test it with a request.",
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// RLS policy verification
// ---------------------------------------------------------------------------

function verifyRlsPolicy(input: PostDeployVerifyInput): Diagnostic[] {
  const results: Diagnostic[] = [];
  const sql = input.deployedContent;

  if (!input.currentTables) {
    results.push({
      code: "VERIFY_NO_STATE",
      severity: "warning",
      message:
        "Cannot verify RLS policies — no current table state provided.",
      suggestion:
        "Pass currentTables from list_tables (with verbose=true) after deploying.",
    });
    return results;
  }

  // Check that RLS is enabled on tables that had policies created
  const policyPattern =
    /CREATE\s+POLICY\s+"?\w+"?\s+ON\s+(?:\w+\.)?(\w+)/gi;
  let match: RegExpExecArray | null;
  const policyTables = new Set<string>();

  while ((match = policyPattern.exec(sql)) !== null) {
    policyTables.add(match[1]);
  }

  for (const tableName of policyTables) {
    const tableInfo = input.currentTables.find((t) => t.name === tableName);
    if (!tableInfo) {
      results.push({
        code: "POLICY_TABLE_MISSING",
        severity: "error",
        message: `Policy created for table "${tableName}" but the table does not exist.`,
        suggestion: "Create the table before creating policies on it.",
      });
    } else if (tableInfo.rlsEnabled === false) {
      results.push({
        code: "POLICY_WITHOUT_RLS",
        severity: "error",
        message: `Policies created for "${tableName}" but RLS is not enabled. Policies have no effect without RLS.`,
        suggestion: `Run: ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`,
      });
    }
  }

  if (results.length === 0) {
    results.push({
      code: "RLS_VERIFIED",
      severity: "info",
      message:
        "Post-deploy verification passed — RLS is enabled on all policy target tables.",
      suggestion: "No action needed.",
    });
  }

  return results;
}
