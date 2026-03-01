/**
 * Prompt Store — unified interface for loading LLM prompts.
 *
 * All prompts live in the `prompts` table with a `kind` discriminator:
 *   - "benchmark"      → comprehensive benchmark scenarios (BenchmarkPrompt)
 *   - "fast"           → short category-aware fast-benchmark questions
 *   - "fast_generic"   → generic cross-category fast-benchmark templates
 *   - "system"         → LLM system prompts (enrichment, URL analysis, digest)
 *
 * Callers supply a Pool so the store itself stays dependency-light.
 */

/** Minimal pool interface — avoids hard dependency on `pg`. */
interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

// ── Prompt Kinds ──────────────────────────────────────────────────

export type PromptKind =
  | "benchmark"
  | "fast"
  | "fast_generic"
  | "system";

// ── DB Row Shape ──────────────────────────────────────────────────

export interface PromptRow {
  id: string;
  kind: PromptKind;
  category: string | null;
  template: string | null;
  text: string;
  metadata: Record<string, unknown>;
  is_active: boolean;
  version: number;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Load all active prompts of a given kind from the database.
 * Returns an empty array if the table doesn't exist yet or is empty.
 */
export async function loadPromptsByKind(
  pool: Queryable,
  kind: PromptKind,
  category?: string,
): Promise<PromptRow[]> {
  try {
    const params: unknown[] = [kind];
    let sql =
      "SELECT id, kind, category, template, text, metadata, is_active, version FROM prompts WHERE kind = $1 AND is_active = TRUE";
    if (category) {
      sql += " AND category = $2";
      params.push(category);
    }
    sql += " ORDER BY id";
    const { rows } = await pool.query(sql, params);
    return rows as unknown as PromptRow[];
  } catch {
    // Table may not exist yet — caller should fall back
    return [];
  }
}

/**
 * Load a single prompt by ID.
 */
export async function loadPromptById(
  pool: Queryable,
  id: string,
): Promise<PromptRow | null> {
  try {
    const { rows } = await pool.query(
      "SELECT id, kind, category, template, text, metadata, is_active, version FROM prompts WHERE id = $1",
      [id],
    );
    return (rows[0] as unknown as PromptRow) ?? null;
  } catch {
    return null;
  }
}

/**
 * Check whether the prompts table has been seeded for a given kind.
 * Useful for deciding whether to fall back to hardcoded defaults.
 */
export async function hasPrompts(
  pool: Queryable,
  kind: PromptKind,
): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM prompts WHERE kind = $1 AND is_active = TRUE LIMIT 1",
      [kind],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
