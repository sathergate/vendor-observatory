import { describe, it, expect, beforeEach } from "vitest";
import {
  recordPreflight,
  recordDeploymentOutcome,
  clearBuffer,
  getBuffer,
  computeStats,
  configureInstrumentation,
} from "./instrument.js";
import type { PreflightResult, PreflightEvent } from "./types.js";

function makeResult(ok: boolean, checker: "migration-sql" = "migration-sql"): PreflightResult {
  return {
    ok,
    diagnostics: ok
      ? []
      : [
          {
            code: "TEST_ERROR",
            severity: "error",
            message: "test",
            suggestion: "fix it",
          },
        ],
    durationMs: 5,
    checker,
    timestamp: new Date().toISOString(),
  };
}

describe("instrument", () => {
  beforeEach(() => {
    clearBuffer();
    // Disable auto-flush for tests
    configureInstrumentation({
      flush: async () => {},
      autoFlushSize: 0,
    });
  });

  it("records preflight events", () => {
    const id = recordPreflight(makeResult(true));
    expect(id).toBeTruthy();
    expect(getBuffer()).toHaveLength(1);
    expect(getBuffer()[0].passed).toBe(true);
  });

  it("records deployment outcomes", () => {
    const id = recordPreflight(makeResult(true));
    recordDeploymentOutcome(id, true);
    expect(getBuffer()[0].deploymentAttempted).toBe(true);
    expect(getBuffer()[0].deploymentSucceeded).toBe(true);
  });

  it("computes stats correctly", () => {
    // 3 passed, 2 failed
    const ids: string[] = [];
    ids.push(recordPreflight(makeResult(true)));
    ids.push(recordPreflight(makeResult(true)));
    ids.push(recordPreflight(makeResult(true)));
    ids.push(recordPreflight(makeResult(false)));
    ids.push(recordPreflight(makeResult(false)));

    // 2 passed → deployed successfully, 1 failed → deployed unsuccessfully
    recordDeploymentOutcome(ids[0], true);
    recordDeploymentOutcome(ids[1], true);
    recordDeploymentOutcome(ids[3], false);

    const stats = computeStats([...getBuffer()]);
    expect(stats.totalRuns).toBe(5);
    expect(stats.passRate).toBeCloseTo(0.6);
    expect(stats.deploymentAttemptRate).toBeCloseTo(0.6);
    expect(stats.successRateWhenPassed).toBeCloseTo(1.0);
    expect(stats.successRateWhenFailed).toBeCloseTo(0.0);
  });

  it("computes empty stats", () => {
    const stats = computeStats([]);
    expect(stats.totalRuns).toBe(0);
    expect(stats.passRate).toBe(0);
  });

  it("tracks fired diagnostic codes", () => {
    recordPreflight(makeResult(false));
    expect(getBuffer()[0].firedCodes).toContain("TEST_ERROR");
  });
});
