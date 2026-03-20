/**
 * Instrumentation for measuring preflight effectiveness.
 *
 * Records every preflight run and its outcome so Vendor Observatory
 * can answer: "Does the preflight tool actually improve deployment success?"
 *
 * Events are stored in-memory with a flush callback. In production,
 * the flush callback writes to PostgreSQL. In benchmarks, it writes
 * to the benchmark run metadata.
 */

import { randomUUID } from "node:crypto";
import type { PreflightResult, PreflightEvent, CheckerName } from "./types.js";

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

export type FlushFn = (events: PreflightEvent[]) => Promise<void>;

const eventBuffer: PreflightEvent[] = [];
let flushCallback: FlushFn | null = null;
let autoFlushSize = 50;

/**
 * Configure where preflight events are sent.
 * Call once at startup.
 */
export function configureInstrumentation(opts: {
  flush: FlushFn;
  autoFlushSize?: number;
}): void {
  flushCallback = opts.flush;
  if (opts.autoFlushSize !== undefined) {
    autoFlushSize = opts.autoFlushSize;
  }
}

/**
 * Record a preflight result as an instrumentation event.
 * Returns the event ID for correlation with deployment outcomes.
 */
export function recordPreflight(result: PreflightResult): string {
  const event: PreflightEvent = {
    runId: randomUUID(),
    checker: result.checker,
    timestamp: result.timestamp,
    passed: result.ok,
    errorCount: result.diagnostics.filter((d) => d.severity === "error").length,
    warningCount: result.diagnostics.filter((d) => d.severity === "warning")
      .length,
    infoCount: result.diagnostics.filter((d) => d.severity === "info").length,
    firedCodes: result.diagnostics.map((d) => d.code),
    durationMs: result.durationMs,
  };

  eventBuffer.push(event);

  if (autoFlushSize > 0 && eventBuffer.length >= autoFlushSize) {
    flush().catch(() => {
      // Best-effort flush — don't block the caller
    });
  }

  return event.runId;
}

/**
 * Record deployment outcome for a previously recorded preflight.
 * This creates the before/after signal needed to measure effectiveness.
 */
export function recordDeploymentOutcome(
  runId: string,
  succeeded: boolean,
): void {
  const event = eventBuffer.find((e) => e.runId === runId);
  if (event) {
    event.deploymentAttempted = true;
    event.deploymentSucceeded = succeeded;
  }
}

/**
 * Flush all buffered events to the configured sink.
 */
export async function flush(): Promise<void> {
  if (!flushCallback || eventBuffer.length === 0) return;

  const events = eventBuffer.splice(0, eventBuffer.length);
  await flushCallback(events);
}

/**
 * Get current buffer contents (for testing/debugging).
 */
export function getBuffer(): readonly PreflightEvent[] {
  return eventBuffer;
}

/**
 * Clear the buffer (for testing).
 */
export function clearBuffer(): void {
  eventBuffer.length = 0;
}

// ---------------------------------------------------------------------------
// Summary statistics (computed from buffer or flushed data)
// ---------------------------------------------------------------------------

export interface PreflightStats {
  totalRuns: number;
  passRate: number;
  deploymentAttemptRate: number;
  deploymentSuccessRate: number;
  /** Success rate when preflight passed vs. failed */
  successRateWhenPassed: number;
  successRateWhenFailed: number;
  /** Most frequently fired diagnostic codes */
  topCodes: Array<{ code: string; count: number }>;
  /** Average check duration in ms */
  avgDurationMs: number;
  /** Breakdown by checker */
  byChecker: Record<
    CheckerName,
    { runs: number; passRate: number }
  >;
}

/**
 * Compute summary statistics from a set of events.
 * Used for dashboards and effectiveness measurement.
 */
export function computeStats(events: PreflightEvent[]): PreflightStats {
  if (events.length === 0) {
    return {
      totalRuns: 0,
      passRate: 0,
      deploymentAttemptRate: 0,
      deploymentSuccessRate: 0,
      successRateWhenPassed: 0,
      successRateWhenFailed: 0,
      topCodes: [],
      avgDurationMs: 0,
      byChecker: {} as Record<CheckerName, { runs: number; passRate: number }>,
    };
  }

  const totalRuns = events.length;
  const passed = events.filter((e) => e.passed).length;

  const withDeployment = events.filter((e) => e.deploymentAttempted);
  const deploySucceeded = withDeployment.filter(
    (e) => e.deploymentSucceeded,
  ).length;

  const passedWithDeploy = withDeployment.filter((e) => e.passed);
  const failedWithDeploy = withDeployment.filter((e) => !e.passed);

  const successWhenPassed = passedWithDeploy.length > 0
    ? passedWithDeploy.filter((e) => e.deploymentSucceeded).length /
      passedWithDeploy.length
    : 0;

  const successWhenFailed = failedWithDeploy.length > 0
    ? failedWithDeploy.filter((e) => e.deploymentSucceeded).length /
      failedWithDeploy.length
    : 0;

  // Code frequency
  const codeCounts = new Map<string, number>();
  for (const event of events) {
    for (const code of event.firedCodes) {
      codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
    }
  }
  const topCodes = [...codeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({ code, count }));

  const avgDurationMs =
    events.reduce((sum, e) => sum + e.durationMs, 0) / totalRuns;

  // By checker
  const byChecker = {} as Record<
    CheckerName,
    { runs: number; passRate: number }
  >;
  const checkerGroups = new Map<CheckerName, PreflightEvent[]>();
  for (const event of events) {
    if (!checkerGroups.has(event.checker)) {
      checkerGroups.set(event.checker, []);
    }
    checkerGroups.get(event.checker)!.push(event);
  }
  for (const [checker, group] of checkerGroups) {
    byChecker[checker] = {
      runs: group.length,
      passRate: group.filter((e) => e.passed).length / group.length,
    };
  }

  return {
    totalRuns,
    passRate: passed / totalRuns,
    deploymentAttemptRate: withDeployment.length / totalRuns,
    deploymentSuccessRate:
      withDeployment.length > 0
        ? deploySucceeded / withDeployment.length
        : 0,
    successRateWhenPassed: successWhenPassed,
    successRateWhenFailed: successWhenFailed,
    topCodes,
    avgDurationMs,
    byChecker,
  };
}
