import { execFile } from "node:child_process";

/**
 * Check if a command is available on PATH.
 */
export function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("which", [cmd], (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}
