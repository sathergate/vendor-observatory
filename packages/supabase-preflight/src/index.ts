/**
 * @obs/supabase-preflight
 *
 * Diagnostic-only pre-flight validation for Supabase deployments.
 * Designed to improve Claude Code's happy-path deployment success rate
 * by surfacing problems before they happen.
 *
 * Architecture:
 *   checkMigration()   → validates SQL before apply_migration
 *   checkRls()         → validates RLS policies before apply
 *   checkEdgeFunction() → validates edge function source before deploy
 *   translateError()   → converts Postgres/Supabase errors into actionable steps
 *   verifyDeploy()     → confirms deployment effect matches intent
 *
 * Forward compatibility:
 *   The PreflightPlugin interface allows future optimizer plugins to
 *   propose (but never auto-apply) fixes for detected issues.
 *
 * Instrumentation:
 *   Every preflight run is recorded via recordPreflight() so Vendor Observatory
 *   can measure whether this tool actually improves outcomes.
 */

// Types
export type {
  Severity,
  Diagnostic,
  PreflightResult,
  CheckerName,
  MigrationCheckInput,
  TableInfo,
  ColumnInfo,
  RlsCheckInput,
  EdgeFunctionCheckInput,
  PostDeployVerifyInput,
  TranslatedError,
  PreflightEvent,
  PreflightPlugin,
  ProposedFix,
} from "./types.js";

// Checkers
export { checkMigration } from "./check-migration.js";
export { checkRls } from "./check-rls.js";
export { checkEdgeFunction } from "./check-edge-function.js";

// Error translation
export { translateError, listKnownErrors } from "./translate-error.js";

// Post-deploy verification
export { verifyDeploy } from "./verify-deploy.js";

// Instrumentation
export {
  configureInstrumentation,
  recordPreflight,
  recordDeploymentOutcome,
  flush,
  getBuffer,
  clearBuffer,
  computeStats,
} from "./instrument.js";
export type { FlushFn, PreflightStats } from "./instrument.js";
