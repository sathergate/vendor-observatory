import { existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Remove workspace directories whose mtime is older than the TTL.
 * Prevents disk exhaustion on the Fly.io machine over time.
 */
export function cleanupOldWorkspaces(root: string, ttlMs: number): number {
  if (!existsSync(root)) return 0;

  const cutoff = Date.now() - ttlMs;
  let cleaned = 0;

  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = join(root, entry.name);
      try {
        const stat = statSync(dirPath);
        if (stat.mtimeMs < cutoff) {
          rmSync(dirPath, { recursive: true, force: true });
          cleaned++;
        }
      } catch {
        // Skip dirs we can't stat
      }
    }
  } catch {
    // Root dir doesn't exist or not readable
  }

  return cleaned;
}
