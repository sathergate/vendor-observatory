/**
 * Re-exports the pure data from prompt-data.ts and adds DB-backed loading.
 *
 * Consumers that only need the BENCHMARK_PROMPTS array (e.g. seed scripts)
 * should import from "./prompt-data.js" directly to avoid pulling in @obs/shared.
 */
export {
  BENCHMARK_PROMPTS,
  type BenchmarkPrompt,
  type ContentTag,
  type PatternTag,
  type PromptMetadata,
  type TemplateType,
} from "./prompt-data.js";

import { loadPromptsByKind } from "@obs/shared";
import type { PromptRow } from "@obs/shared";
import type { BenchmarkPrompt, ContentTag, PatternTag, TemplateType } from "./prompt-data.js";

// ── DB-backed prompt loading ──────────────────────────────────────

/** Minimal pool interface — avoids hard dependency on `pg`. */
interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

function rowToBenchmarkPrompt(row: PromptRow): BenchmarkPrompt {
  const meta = row.metadata as Record<string, unknown>;
  return {
    id: row.id,
    category: row.category ?? "other",
    template: (row.template as TemplateType) ?? "node-api",
    text: row.text,
    metadata: {
      contentTags: (meta.contentTags ?? []) as ContentTag[],
      patternTags: (meta.patternTags ?? []) as PatternTag[],
      constraints: (meta.constraints as string[]) ?? [],
      existingStack: (meta.existingStack as string[]) ?? [],
      failureMode: (meta.failureMode as string) ?? null,
      vendorsNamedInPrompt: (meta.vendorsNamedInPrompt as string[]) ?? [],
    },
  };
}

/**
 * Load benchmark prompts from the database.
 * Requires the prompts table to be seeded (run db/seed-prompts.ts).
 */
export async function loadBenchmarkPrompts(pool: Queryable): Promise<BenchmarkPrompt[]> {
  const rows = await loadPromptsByKind(pool, "benchmark");
  if (rows.length === 0) {
    throw new Error(
      "No benchmark prompts found in DB. Run: DATABASE_URL=... npx tsx db/seed-prompts.ts",
    );
  }

  return rows.map(rowToBenchmarkPrompt);
}
