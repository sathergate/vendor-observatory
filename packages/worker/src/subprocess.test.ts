import { describe, it, expect } from "vitest";
import { spawnAndWait } from "./subprocess.js";

describe("spawnAndWait", () => {
  it("captures stdout from a successful command", async () => {
    const result = await spawnAndWait("echo", ["hello world"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello world");
    expect(result.stderr).toBe("");
  });

  it("captures stderr and non-zero exit code", async () => {
    const result = await spawnAndWait("node", [
      "-e",
      "process.stderr.write('oops'); process.exit(2)",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("oops");
  });

  it("passes custom environment variables to the child process", async () => {
    const result = await spawnAndWait(
      "node",
      ["-e", "process.stdout.write(process.env.TEST_VAR ?? 'missing')"],
      { TEST_VAR: "injected" },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("injected");
  });

  it("kills the process after timeout", async () => {
    const start = Date.now();
    const result = await spawnAndWait(
      "node",
      ["-e", "setTimeout(() => {}, 30000)"],
      undefined,
      500, // 500ms timeout
    );
    const elapsed = Date.now() - start;

    // Should have been killed, so non-zero exit
    expect(result.exitCode).not.toBe(0);
    // Should complete in well under 30s
    expect(elapsed).toBeLessThan(10_000);
  });

  it("rejects when the command does not exist", async () => {
    await expect(
      spawnAndWait("nonexistent-binary-xyz", []),
    ).rejects.toThrow();
  });

  it("handles commands that produce no output", async () => {
    const result = await spawnAndWait("true", []);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("handles multi-line stdout correctly", async () => {
    const result = await spawnAndWait("node", [
      "-e",
      "console.log('line1'); console.log('line2'); console.log('line3')",
    ]);
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trim().split("\n");
    expect(lines).toEqual(["line1", "line2", "line3"]);
  });
});
