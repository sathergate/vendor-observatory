/**
 * Types for the Supabase pre-flight diagnostic system.
 *
 * Design principle: diagnostic/validation only — never executes operations,
 * never generates templates, never auto-remediates. This is a read-only
 * instrument that increases Claude Code's deployment success rate by
 * surfacing problems before they happen.
 */

// ---------------------------------------------------------------------------
// Severity & Diagnostics
// ---------------------------------------------------------------------------

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  /** Stable code for programmatic matching, e.g. "MISSING_IF_NOT_EXISTS" */
  code: string;
  severity: Severity;
  /** Human-readable explanation of the issue */
  message: string;
  /** Actionable suggestion for fixing the issue */
  suggestion: string;
  /** Supabase docs URL if relevant */
  docsUrl?: string;
  /** The SQL fragment or code that triggered this diagnostic */
  source?: string;
  /** Line number in the original input, if applicable */
  line?: number;
}

// ---------------------------------------------------------------------------
// Pre-flight check results
// ---------------------------------------------------------------------------

export interface PreflightResult {
  /** Did all checks pass with no errors? (warnings are allowed) */
  ok: boolean;
  diagnostics: Diagnostic[];
  /** Wall-clock duration of the check in ms */
  durationMs: number;
  /** Which checker produced this result */
  checker: CheckerName;
  /** ISO timestamp of when the check ran */
  timestamp: string;
}

export type CheckerName =
  | "migration-sql"
  | "rls-policy"
  | "edge-function"
  | "post-deploy";

// ---------------------------------------------------------------------------
// Migration checker inputs
// ---------------------------------------------------------------------------

export interface MigrationCheckInput {
  /** The SQL to validate before applying */
  sql: string;
  /** Current tables in the project (from list_tables) — optional but improves checks */
  existingTables?: TableInfo[];
  /** Currently enabled extensions (from list_extensions) */
  existingExtensions?: string[];
}

export interface TableInfo {
  schema: string;
  name: string;
  columns?: ColumnInfo[];
  rlsEnabled?: boolean;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
}

// ---------------------------------------------------------------------------
// RLS checker inputs
// ---------------------------------------------------------------------------

export interface RlsCheckInput {
  /** The RLS policy SQL (CREATE POLICY or ALTER TABLE ENABLE RLS) */
  sql: string;
  /** Current tables and their columns for cross-referencing */
  existingTables?: TableInfo[];
}

// ---------------------------------------------------------------------------
// Edge function checker inputs
// ---------------------------------------------------------------------------

export interface EdgeFunctionCheckInput {
  /** The TypeScript/Deno source of the edge function */
  source: string;
  /** The function name/slug */
  name: string;
  /** Whether JWT verification is enabled */
  verifyJwt: boolean;
  /** Additional files included in the deploy (e.g. deno.json) */
  additionalFiles?: Array<{ name: string; content: string }>;
}

// ---------------------------------------------------------------------------
// Post-deploy verification inputs
// ---------------------------------------------------------------------------

export interface PostDeployVerifyInput {
  /** What kind of deployment was performed */
  kind: "migration" | "edge-function" | "rls-policy";
  /** The SQL or source that was deployed */
  deployedContent: string;
  /** Current state after deployment (tables, functions, etc.) */
  currentTables?: TableInfo[];
  currentEdgeFunctions?: string[];
  /** The specific edge function name/slug that was deployed */
  deployedFunctionName?: string;
}

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

export interface TranslatedError {
  /** Original Postgres/Supabase error code */
  originalCode: string;
  /** Original error message */
  originalMessage: string;
  /** Human-readable explanation */
  explanation: string;
  /** Concrete next step for the LLM or developer */
  actionableStep: string;
  /** Supabase docs URL if relevant */
  docsUrl?: string;
  /** Common root cause patterns */
  commonCauses: string[];
}

// ---------------------------------------------------------------------------
// Instrumentation
// ---------------------------------------------------------------------------

export interface PreflightEvent {
  /** Unique ID for this preflight run */
  runId: string;
  /** Which checker ran */
  checker: CheckerName;
  /** ISO timestamp */
  timestamp: string;
  /** Did the preflight pass? */
  passed: boolean;
  /** Count of errors, warnings, info */
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** Diagnostic codes that fired */
  firedCodes: string[];
  /** Wall-clock duration in ms */
  durationMs: number;
  /** Was a subsequent deployment attempted? (set after the fact) */
  deploymentAttempted?: boolean;
  /** Did the deployment succeed? (set after the fact) */
  deploymentSucceeded?: boolean;
}

// ---------------------------------------------------------------------------
// Extension point: future optimizer layer
// ---------------------------------------------------------------------------

/**
 * A PreflightPlugin can inspect diagnostics and optionally propose fixes.
 * In the current diagnostic-only mode, the `propose` method is never called.
 * This interface exists for forward compatibility with a future optimizer
 * that can suggest (but not auto-apply) remediations.
 */
export interface PreflightPlugin {
  /** Unique plugin identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Which checker this plugin extends */
  checker: CheckerName;
  /**
   * Analyze input and return additional diagnostics.
   * Called during the diagnostic phase.
   */
  analyze(input: unknown): Diagnostic[];
  /**
   * Propose a fix for a diagnostic. Returns modified SQL/source or null
   * if no fix is available. NOT called in diagnostic-only mode.
   * Reserved for future optimizer layer.
   */
  propose?(diagnostic: Diagnostic, input: unknown): ProposedFix | null;
}

export interface ProposedFix {
  /** The diagnostic this fix addresses */
  diagnosticCode: string;
  /** Human-readable description of the change */
  description: string;
  /** The modified SQL or source code */
  modified: string;
  /** Confidence that this fix is correct (0-1) */
  confidence: number;
  /** Whether this fix requires human review (always true for now) */
  requiresReview: true;
}
