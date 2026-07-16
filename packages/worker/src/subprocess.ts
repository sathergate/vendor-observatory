import { spawn } from "node:child_process";

export interface SubprocessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn a child process and wait for it to complete.
 * Returns the exit code, stdout, and stderr.
 *
 * The worker's environment variables (DATABASE_URL, ANTHROPIC_API_KEY, etc.)
 * are passed through by default unless overridden via `env`.
 */
export function spawnAndWait(
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  timeoutMs?: number,
): Promise<SubprocessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 5000);
      }, timeoutMs);
    }

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
      });
    });
  });
}
