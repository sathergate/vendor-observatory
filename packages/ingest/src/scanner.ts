import { readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { SourcePlatform } from "@obs/shared";

export interface TranscriptFile {
  path: string;
  size: number;
  mtime: string;
  platform: SourcePlatform;
}

/**
 * Get the default transcript directories for each platform.
 */
function getTranscriptDirs(platform: SourcePlatform): string[] {
  const home = homedir();

  switch (platform) {
    case "claude_code":
      return [join(home, ".claude", "projects")];
    case "codex_cli":
      return [join(home, ".codex", "sessions")];
    default:
      return [];
  }
}

/**
 * Recursively find all .jsonl files in a directory.
 */
function findJsonlFiles(dir: string, maxDepth = 10, currentDepth = 0): string[] {
  if (currentDepth > maxDepth) return [];
  if (!existsSync(dir)) return [];

  const results: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") && !entry.name.startsWith(".claude") && !entry.name.startsWith(".codex")) {
          continue;
        }
        results.push(...findJsonlFiles(fullPath, maxDepth, currentDepth + 1));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Permission denied or other error
  }

  return results;
}

/**
 * Scan for all transcript files for a given platform.
 */
export function scanForTranscripts(platform: SourcePlatform): TranscriptFile[] {
  const dirs = getTranscriptDirs(platform);
  const files: TranscriptFile[] = [];

  for (const dir of dirs) {
    const resolvedDir = resolve(dir);
    const jsonlFiles = findJsonlFiles(resolvedDir);

    for (const filePath of jsonlFiles) {
      try {
        const stat = statSync(filePath);
        files.push({
          path: filePath,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          platform,
        });
      } catch {
        // Skip files we can't stat
      }
    }
  }

  return files;
}

/**
 * Scan for all transcript files across all platforms.
 */
export function scanAllTranscripts(): TranscriptFile[] {
  const platforms: SourcePlatform[] = ["claude_code", "codex_cli"];
  return platforms.flatMap(scanForTranscripts);
}
