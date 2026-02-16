import { mkdirSync, cpSync, rmSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import type { TemplateType } from "./prompts.js";

const BENCH_ROOT = "/tmp/obs-bench";
const RETENTION_DAYS = 7;

/**
 * Get the template source directory for a given template type.
 */
function getTemplateDir(template: TemplateType): string {
  // Look relative to this file's location (dist/workspace.js → packages/benchmark/templates/)
  const candidates = [
    resolve(import.meta.dirname ?? __dirname, "..", "templates", template),
    resolve(process.cwd(), "packages", "benchmark", "templates", template),
  ];

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }

  throw new Error(`Template not found: ${template}. Tried: ${candidates.join(", ")}`);
}

/**
 * Create an isolated workspace for a benchmark run.
 *
 * Returns the path to the workspace directory with:
 * - Template files copied in
 * - Git repo initialized with __obs_bench__ branch
 */
export function createWorkspace(
  promptId: string,
  assistant: string,
  template: TemplateType,
): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dir = join(BENCH_ROOT, date, `${promptId}-${assistant}`);

  // Clean up if exists from a previous run today
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }

  mkdirSync(dir, { recursive: true });

  // Copy template
  const templateDir = getTemplateDir(template);
  cpSync(templateDir, dir, { recursive: true });

  // Initialize git repo with benchmark branch marker
  try {
    execSync("git init && git add -A && git commit -m 'initial' --allow-empty && git branch -m __obs_bench__", {
      cwd: dir,
      stdio: "pipe",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "obs-bench",
        GIT_AUTHOR_EMAIL: "bench@vendor-observatory.local",
        GIT_COMMITTER_NAME: "obs-bench",
        GIT_COMMITTER_EMAIL: "bench@vendor-observatory.local",
      },
    });
  } catch {
    // Git init failure is non-fatal — workspace still usable
  }

  return dir;
}

/**
 * Clean up old workspace directories beyond the retention period.
 */
export function cleanupOldWorkspaces(): number {
  if (!existsSync(BENCH_ROOT)) return 0;

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let cleaned = 0;

  try {
    const entries = readdirSync(BENCH_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = join(BENCH_ROOT, entry.name);
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
