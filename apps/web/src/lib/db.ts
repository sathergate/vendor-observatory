import { Pool } from "pg";

// ── Table names (Lakebase synced tables) ─────────────────────────────
const T_SESSIONS = "sessions_synced";
const T_OBSERVATIONS = "observations_synced";
const T_RESPONSE_CONTEXT = "response_context_synced";
const T_PROMPT_METADATA = "prompt_metadata_synced";

// ── Lazy Pool initialization ──────────────────────────────────────────

let _pool: Pool | null = null;
let _poolFailed = false;

function getPool(): Pool | null {
  if (_poolFailed) return null;
  if (_pool) return _pool;
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error("[vendor-observatory] DATABASE_URL not set");
      _poolFailed = true;
      return null;
    }
    _pool = new Pool({ connectionString });
    return _pool;
  } catch (err) {
    console.error("[vendor-observatory] Pool init failed:", err);
    _poolFailed = true;
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

const _tableCache = new Map<string, boolean>();

async function hasTable(pool: Pool, name: string): Promise<boolean> {
  const cached = _tableCache.get(name);
  if (cached !== undefined) return cached;
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public'",
    [name],
  );
  const exists = rows.length > 0;
  _tableCache.set(name, exists);
  return exists;
}

/** @internal Reset module state for testing only */
export function _resetForTesting(): void {
  _pool = null;
  _poolFailed = false;
  _tableCache.clear();
}

export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

// ── Dashboard Stats ─────────────────────────────────────────────────

export async function getDashboardStats() {
  const pool = getPool();
  if (!pool) return { totalSessions: 0, totalObservations: 0, uniqueVendors: 0, platformBreakdown: {} as Record<string, number>, lastIngestedAt: null as string | null };
  try {
    const sessions = (await pool.query(`SELECT COUNT(*) AS c FROM ${T_SESSIONS}`)).rows[0] as { c: string };
    const observations = (await pool.query(`SELECT COUNT(*) AS c FROM ${T_OBSERVATIONS}`)).rows[0] as { c: string };
    const vendors = (await pool.query(`SELECT COUNT(DISTINCT vendor_canonical_id) AS c FROM ${T_OBSERVATIONS}`)).rows[0] as { c: string };
    const { rows: platforms } = await pool.query(`SELECT source_platform, COUNT(*) AS c FROM ${T_SESSIONS} GROUP BY source_platform`);
    const platformBreakdown: Record<string, number> = {};
    for (const p of platforms as Array<{ source_platform: string; c: string }>) platformBreakdown[p.source_platform] = Number(p.c);
    const lastIngested = (await pool.query("SELECT MAX(ingested_at) AS t FROM ingested_files")).rows[0] as { t: string | null };
    return { totalSessions: Number(sessions.c), totalObservations: Number(observations.c), uniqueVendors: Number(vendors.c), platformBreakdown, lastIngestedAt: lastIngested?.t ?? null };
  } catch { return { totalSessions: 0, totalObservations: 0, uniqueVendors: 0, platformBreakdown: {}, lastIngestedAt: null }; }
}

// ── Vendor Stats ────────────────────────────────────────────────────

export interface VendorStatsRow {
  vendor_canonical_id: string;
  total: number;
  installed: number;
  configured: number;
  implemented: number;
  recommended: number;
  compared: number;
  mentioned: number;
  rejected: number;
  platforms: string;
  work_category: string;
}

export async function getVendorStats(platformFilter?: string, categoryFilter?: string, vendorScope?: string | null): Promise<VendorStatsRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    let where = "WHERE 1=1";
    const params: string[] = [];
    let paramIdx = 1;
    if (vendorScope) {
      where += ` AND o.vendor_canonical_id = $${paramIdx++}`;
      params.push(vendorScope);
    }
    if (platformFilter) {
      where += ` AND o.session_id IN (SELECT id FROM ${T_SESSIONS} WHERE source_platform = $${paramIdx++})`;
      params.push(platformFilter);
    }
    if (categoryFilter) {
      where += ` AND o.work_category = $${paramIdx++}`;
      params.push(categoryFilter);
    }
    const sql = `
      SELECT
        o.vendor_canonical_id,
        COUNT(*) AS total,
        SUM(CASE WHEN o.mention_type = 'installed' THEN 1 ELSE 0 END) AS installed,
        SUM(CASE WHEN o.mention_type = 'configured' THEN 1 ELSE 0 END) AS configured,
        SUM(CASE WHEN o.mention_type = 'implemented' THEN 1 ELSE 0 END) AS implemented,
        SUM(CASE WHEN o.mention_type = 'recommended' THEN 1 ELSE 0 END) AS recommended,
        SUM(CASE WHEN o.mention_type = 'compared' THEN 1 ELSE 0 END) AS compared,
        SUM(CASE WHEN o.mention_type = 'mentioned' THEN 1 ELSE 0 END) AS mentioned,
        SUM(CASE WHEN o.mention_type = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        string_agg(DISTINCT s.source_platform, ',') AS platforms,
        o.work_category
      FROM ${T_OBSERVATIONS} o
      JOIN ${T_SESSIONS} s ON o.session_id = s.id
      ${where}
      GROUP BY o.vendor_canonical_id, o.work_category
      ORDER BY total DESC
    `;
    const { rows } = await pool.query(sql, params);
    return rows.map((r: Record<string, unknown>) => ({
      vendor_canonical_id: r.vendor_canonical_id as string,
      total: Number(r.total),
      installed: Number(r.installed),
      configured: Number(r.configured),
      implemented: Number(r.implemented),
      recommended: Number(r.recommended),
      compared: Number(r.compared),
      mentioned: Number(r.mentioned),
      rejected: Number(r.rejected),
      platforms: (r.platforms as string) || "",
      work_category: (r.work_category as string) || "",
    }));
  } catch { return []; }
}

// ── Platform Comparison ─────────────────────────────────────────────

export interface PlatformCompRow {
  vendor_canonical_id: string;
  claude_code_count: number;
  codex_cli_count: number;
}

export async function getPlatformComparison(vendorScope?: string | null): Promise<PlatformCompRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const params: string[] = [];
    let vendorWhere = "";
    if (vendorScope) {
      vendorWhere = "WHERE o.vendor_canonical_id = $1";
      params.push(vendorScope);
    }
    const { rows } = await pool.query(`
      SELECT
        o.vendor_canonical_id,
        SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) AS claude_code_count,
        SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END) AS codex_cli_count
      FROM ${T_OBSERVATIONS} o
      JOIN ${T_SESSIONS} s ON o.session_id = s.id
      ${vendorWhere}
      GROUP BY o.vendor_canonical_id
      HAVING SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) > 0
         OR SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END) > 0
      ORDER BY (SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) + SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END)) DESC
    `, params);
    return rows.map((r: Record<string, unknown>) => ({
      vendor_canonical_id: r.vendor_canonical_id as string,
      claude_code_count: Number(r.claude_code_count),
      codex_cli_count: Number(r.codex_cli_count),
    }));
  } catch { return []; }
}

// ── Actions / Funnel ────────────────────────────────────────────────

export interface FunnelRow {
  vendor_canonical_id: string;
  mentioned_total: number;
  recommended_total: number;
  installed_total: number;
}

export async function getActionFunnel(vendorScope?: string | null): Promise<FunnelRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const params: string[] = [];
    let vendorWhere = "";
    if (vendorScope) {
      vendorWhere = "WHERE vendor_canonical_id = $1";
      params.push(vendorScope);
    }
    const { rows } = await pool.query(`
      SELECT
        vendor_canonical_id,
        SUM(CASE WHEN mention_type IN ('mentioned', 'compared', 'recommended', 'installed', 'configured', 'implemented') THEN 1 ELSE 0 END) AS mentioned_total,
        SUM(CASE WHEN mention_type IN ('recommended') THEN 1 ELSE 0 END) AS recommended_total,
        SUM(CASE WHEN mention_type IN ('installed', 'configured', 'implemented') THEN 1 ELSE 0 END) AS installed_total
      FROM ${T_OBSERVATIONS}
      ${vendorWhere}
      GROUP BY vendor_canonical_id
      HAVING SUM(CASE WHEN mention_type IN ('mentioned', 'compared', 'recommended', 'installed', 'configured', 'implemented') THEN 1 ELSE 0 END) > 0
      ORDER BY SUM(CASE WHEN mention_type IN ('mentioned', 'compared', 'recommended', 'installed', 'configured', 'implemented') THEN 1 ELSE 0 END) DESC
    `, params);
    return rows.map((r: Record<string, unknown>) => ({
      vendor_canonical_id: r.vendor_canonical_id as string,
      mentioned_total: Number(r.mentioned_total),
      recommended_total: Number(r.recommended_total),
      installed_total: Number(r.installed_total),
    }));
  } catch { return []; }
}

// ── Sessions ────────────────────────────────────────────────────────

export interface SessionListRow {
  id: string;
  source_platform: string;
  model_id: string | null;
  started_at: string;
  cwd: string | null;
  turn_count: number;
  observation_count: number;
  vendors: string;
  has_selected_vendor?: boolean;
}

export async function getSessionList(limit = 50, offset = 0, vendorScope?: string | null): Promise<SessionListRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const params: (string | number)[] = [];
    let paramIdx = 1;
    let vendorWhere = "";
    if (vendorScope) {
      vendorWhere = `WHERE s.id IN (SELECT session_id FROM ${T_OBSERVATIONS} WHERE vendor_canonical_id = $${paramIdx++})`;
      params.push(vendorScope);
    }
    params.push(limit, offset);
    const { rows } = await pool.query(`
      SELECT
        s.id, s.source_platform, s.model_id, s.started_at, s.cwd, s.turn_count,
        COUNT(o.id) AS observation_count,
        string_agg(DISTINCT o.vendor_canonical_id, ',') AS vendors
      FROM ${T_SESSIONS} s
      LEFT JOIN ${T_OBSERVATIONS} o ON s.id = o.session_id
      ${vendorWhere}
      GROUP BY s.id, s.source_platform, s.model_id, s.started_at, s.cwd, s.turn_count
      ORDER BY s.started_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, params);
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      source_platform: r.source_platform as string,
      model_id: r.model_id as string | null,
      started_at: r.started_at as string,
      cwd: r.cwd as string | null,
      turn_count: Number(r.turn_count),
      observation_count: Number(r.observation_count),
      vendors: (r.vendors as string) || "",
    }));
  } catch (err) {
    console.error("[vendor-observatory] getSessionList error:", err);
    return [];
  }
}

export interface SessionDetail {
  session: { id: string; source_platform: string; model_id: string | null; started_at: string; ended_at: string | null; cwd: string | null; git_branch: string | null; turn_count: number };
  observations: Array<{ vendor_canonical_id: string; vendor_raw: string; mention_type: string; work_category: string | null; confidence: number; context_snippet: string | null; user_prompt_snippet: string | null; timestamp: string }>;
  toolActions: Array<{ tool_name: string; command_or_path: string | null; vendor_canonical_id: string | null; action_type: string | null; success: number | null; timestamp: string }>;
}

export async function getSessionDetail(id: string, vendorScope?: string | null): Promise<SessionDetail | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    // If vendor scoped, verify this session has observations for the vendor
    if (vendorScope) {
      const check = await pool.query(
        `SELECT 1 FROM ${T_OBSERVATIONS} WHERE session_id = $1 AND vendor_canonical_id = $2 LIMIT 1`,
        [id, vendorScope],
      );
      if (check.rows.length === 0) return null;
    }
    const sessionResult = await pool.query(`SELECT * FROM ${T_SESSIONS} WHERE id = $1`, [id]);
    const session = sessionResult.rows[0] as SessionDetail["session"] | undefined;
    if (!session) return null;
    const obsResult = await pool.query(`SELECT vendor_canonical_id, vendor_raw, mention_type, work_category, confidence, context_snippet, user_prompt_snippet, timestamp FROM ${T_OBSERVATIONS} WHERE session_id = $1 ORDER BY timestamp`, [id]);
    const toolResult = await pool.query("SELECT tool_name, command_or_path, vendor_canonical_id, action_type, success, timestamp FROM tool_actions WHERE session_id = $1 ORDER BY timestamp", [id]);
    return { session, observations: obsResult.rows as SessionDetail["observations"], toolActions: toolResult.rows as SessionDetail["toolActions"] };
  } catch { return null; }
}

export async function getVendorScopedSessionList(
  vendorId: string,
  categoryVendorIds: string[],
  vendorName: string,
  limit = 50,
  offset = 0,
): Promise<SessionListRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const params: (string | string[] | number)[] = [vendorId, categoryVendorIds, `%${vendorName}%`, limit, offset];
    const { rows } = await pool.query(`
      SELECT s.id, s.source_platform, s.model_id, s.started_at, s.cwd, s.turn_count,
        COUNT(o.id) AS observation_count,
        string_agg(DISTINCT o.vendor_canonical_id, ',') AS vendors,
        BOOL_OR(o.vendor_canonical_id = $1) AS has_selected_vendor
      FROM ${T_SESSIONS} s
      JOIN ${T_OBSERVATIONS} o ON s.id = o.session_id
      WHERE o.vendor_canonical_id = $1
         OR o.vendor_canonical_id = ANY($2::text[])
         OR o.user_prompt_snippet ILIKE $3
      GROUP BY s.id, s.source_platform, s.model_id, s.started_at, s.cwd, s.turn_count
      ORDER BY s.started_at DESC
      LIMIT $4 OFFSET $5
    `, params);
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      source_platform: r.source_platform as string,
      model_id: r.model_id as string | null,
      started_at: r.started_at as string,
      cwd: r.cwd as string | null,
      turn_count: Number(r.turn_count),
      observation_count: Number(r.observation_count),
      vendors: (r.vendors as string) || "",
      has_selected_vendor: Boolean(r.has_selected_vendor),
    }));
  } catch (err) {
    console.error("[vendor-observatory] getVendorScopedSessionList error:", err);
    return [];
  }
}

const T_RAW_TRANSCRIPTS = "raw_transcripts_synced";

export interface TranscriptTurn {
  role: string;
  text_content: string;
}

export async function getSessionTranscript(sessionId: string): Promise<TranscriptTurn[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_RAW_TRANSCRIPTS))) return [];
    const { rows } = await pool.query(
      `SELECT raw_turns_json FROM ${T_RAW_TRANSCRIPTS} WHERE session_id = $1 LIMIT 1`,
      [sessionId],
    );
    if (rows.length === 0) return [];
    return safeJsonParse<TranscriptTurn[]>(rows[0].raw_turns_json as string, []);
  } catch { return []; }
}

// ── Top Vendors (for dashboard) ─────────────────────────────────────

export async function getTopVendors(limit = 10): Promise<Array<{ vendor_canonical_id: string; count: number }>> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`
      SELECT vendor_canonical_id, COUNT(*) AS count
      FROM ${T_OBSERVATIONS}
      GROUP BY vendor_canonical_id
      ORDER BY count DESC
      LIMIT $1
    `, [limit]);
    return rows.map((r: Record<string, unknown>) => ({
      vendor_canonical_id: r.vendor_canonical_id as string,
      count: Number(r.count),
    }));
  } catch { return []; }
}

// ── Categories ──────────────────────────────────────────────────────

export async function getCategories(): Promise<string[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`SELECT DISTINCT work_category FROM ${T_OBSERVATIONS} WHERE work_category IS NOT NULL ORDER BY work_category`);
    return rows.map((r: { work_category: string }) => r.work_category);
  } catch { return []; }
}

export interface CategoryDbRow {
  id: string;
  display_name: string;
  description: string;
  icon: string;
}

/**
 * Fetch all categories from the `categories` table in the database.
 * Returns an empty array if the table doesn't exist or the DB is unavailable.
 */
export async function getCategoryMeta(): Promise<CategoryDbRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "categories"))) return [];
    const { rows } = await pool.query("SELECT id, display_name, description, icon FROM categories ORDER BY display_name");
    return rows as CategoryDbRow[];
  } catch { return []; }
}

// ── Benchmark Stats ─────────────────────────────────────────────────

export interface BenchmarkRunRow {
  id: string;
  source_platform: string;
  model_id: string | null;
  started_at: string;
  cwd: string | null;
  turn_count: number;
  observation_count: number;
  vendors: string;
}

export async function getBenchmarkSessions(limit = 100, vendorScope?: string | null): Promise<BenchmarkRunRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const params: (string | number)[] = [];
    let paramIdx = 1;
    let extraWhere = "";
    if (vendorScope) {
      extraWhere = `AND s.id IN (SELECT session_id FROM ${T_OBSERVATIONS} WHERE vendor_canonical_id = $${paramIdx++})`;
      params.push(vendorScope);
    }
    params.push(limit);
    const { rows } = await pool.query(`
      SELECT s.id, s.source_platform, s.model_id, s.started_at, s.cwd, s.turn_count,
        COUNT(o.id) AS observation_count,
        string_agg(DISTINCT o.vendor_canonical_id, ',') AS vendors
      FROM ${T_SESSIONS} s LEFT JOIN ${T_OBSERVATIONS} o ON s.id = o.session_id
      WHERE s.is_benchmark = TRUE ${extraWhere}
      GROUP BY s.id ORDER BY s.started_at DESC LIMIT $${paramIdx}
    `, params);
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      source_platform: r.source_platform as string,
      model_id: r.model_id as string | null,
      started_at: r.started_at as string,
      cwd: r.cwd as string | null,
      turn_count: Number(r.turn_count),
      observation_count: Number(r.observation_count),
      vendors: (r.vendors as string) || "",
    }));
  } catch { return []; }
}

export interface BenchmarkVendorCompRow {
  vendor_canonical_id: string;
  claude_code_count: number;
  codex_cli_count: number;
  cursor_count: number;
  total: number;
}

export async function getBenchmarkVendorComparison(vendorScope?: string | null): Promise<BenchmarkVendorCompRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const params: string[] = [];
    let extraWhere = "";
    if (vendorScope) {
      extraWhere = "AND o.vendor_canonical_id = $1";
      params.push(vendorScope);
    }
    const { rows } = await pool.query(`
      SELECT o.vendor_canonical_id,
        SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) AS claude_code_count,
        SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END) AS codex_cli_count,
        SUM(CASE WHEN s.source_platform = 'cursor' THEN 1 ELSE 0 END) AS cursor_count,
        COUNT(*) AS total
      FROM ${T_OBSERVATIONS} o JOIN ${T_SESSIONS} s ON o.session_id = s.id
      WHERE s.is_benchmark = TRUE ${extraWhere}
      GROUP BY o.vendor_canonical_id ORDER BY total DESC
    `, params);
    return rows.map((r: Record<string, unknown>) => ({
      vendor_canonical_id: r.vendor_canonical_id as string,
      claude_code_count: Number(r.claude_code_count),
      codex_cli_count: Number(r.codex_cli_count),
      cursor_count: Number(r.cursor_count),
      total: Number(r.total),
    }));
  } catch { return []; }
}

export async function getBenchmarkStats(vendorScope?: string | null) {
  const pool = getPool();
  if (!pool) return { totalBenchmarkSessions: 0, totalBenchmarkObservations: 0, platformBreakdown: {} as Record<string, number> };
  try {
    const vendorFilter = vendorScope
      ? "AND id IN (SELECT session_id FROM ${T_OBSERVATIONS} WHERE vendor_canonical_id = $1)"
      : "";
    const obsVendorFilter = vendorScope
      ? "AND vendor_canonical_id = $1"
      : "";
    const params = vendorScope ? [vendorScope] : [];
    const sessions = (await pool.query(`SELECT COUNT(*) AS c FROM ${T_SESSIONS} WHERE is_benchmark = TRUE ${vendorFilter}`, params)).rows[0] as { c: string };
    const observations = (await pool.query(`SELECT COUNT(*) AS c FROM ${T_OBSERVATIONS} WHERE session_id IN (SELECT id FROM ${T_SESSIONS} WHERE is_benchmark = TRUE) ${obsVendorFilter}`, params)).rows[0] as { c: string };
    const { rows: platforms } = await pool.query(`SELECT source_platform, COUNT(*) AS c FROM ${T_SESSIONS} WHERE is_benchmark = TRUE ${vendorFilter} GROUP BY source_platform`, params);
    const platformBreakdown: Record<string, number> = {};
    for (const p of platforms as Array<{ source_platform: string; c: string }>) platformBreakdown[p.source_platform] = Number(p.c);
    return { totalBenchmarkSessions: Number(sessions.c), totalBenchmarkObservations: Number(observations.c), platformBreakdown };
  } catch { return { totalBenchmarkSessions: 0, totalBenchmarkObservations: 0, platformBreakdown: {} }; }
}

// ── Enrichment: Prompt Metadata ────────────────────────────────────

export interface PromptMetadataWebRow {
  prompt_id: string;
  category: string;
  content_tags: string;
  pattern_tags: string;
  constraints: string;
  existing_stack: string;
  failure_mode: string | null;
  vendors_named_in_prompt: string;
}

export async function getPromptMetadata(): Promise<PromptMetadataWebRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_PROMPT_METADATA))) return [];
    const { rows } = await pool.query(`SELECT * FROM ${T_PROMPT_METADATA} ORDER BY prompt_id`);
    return rows as PromptMetadataWebRow[];
  } catch { return []; }
}

export async function getPromptMetadataById(promptId: string): Promise<PromptMetadataWebRow | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    if (!(await hasTable(pool, T_PROMPT_METADATA))) return null;
    const { rows } = await pool.query(`SELECT * FROM ${T_PROMPT_METADATA} WHERE prompt_id = $1`, [promptId]);
    return (rows[0] as PromptMetadataWebRow) ?? null;
  } catch { return null; }
}

// ── Enrichment: Response Context ───────────────────────────────────

export interface ResponseContextWebRow {
  id: number;
  session_id: string;
  prompt_id: string;
  primary_vendor: string | null;
  is_implemented: boolean;
  rationale_snippet: string | null;
  vendors_mentioned: string;
  trade_offs_snippet: string | null;
  gotchas_snippet: string | null;
  constraints_addressed: string;
  extracted_at: string;
}

export async function getResponseContextByPrompt(promptId: string): Promise<(ResponseContextWebRow & { source_platform: string })[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT))) return [];
    const { rows } = await pool.query(`
      SELECT rc.*, s.source_platform
      FROM ${T_RESPONSE_CONTEXT} rc
      JOIN ${T_SESSIONS} s ON rc.session_id = s.id
      WHERE rc.prompt_id = $1
      ORDER BY rc.extracted_at DESC
    `, [promptId]);
    return rows as (ResponseContextWebRow & { source_platform: string })[];
  } catch { return []; }
}

export async function getResponseContextBySession(sessionId: string): Promise<ResponseContextWebRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT))) return [];
    const { rows } = await pool.query(`SELECT * FROM ${T_RESPONSE_CONTEXT} WHERE session_id = $1`, [sessionId]);
    return rows as ResponseContextWebRow[];
  } catch { return []; }
}

// ── Enrichment: Primary Vendor Leaderboard ─────────────────────────

export interface PrimaryVendorCountRow {
  primary_vendor: string;
  count: number;
}

export async function getPrimaryVendorCounts(filters?: {
  category?: string;
  platform?: string;
  contentTag?: string;
  patternTag?: string;
  vendorScope?: string | null;
}): Promise<PrimaryVendorCountRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT)) || !(await hasTable(pool, T_PROMPT_METADATA))) return [];
    let where = "rc.primary_vendor IS NOT NULL";
    const params: string[] = [];
    let paramIdx = 1;
    if (filters?.vendorScope) {
      where += ` AND rc.primary_vendor = $${paramIdx++}`;
      params.push(filters.vendorScope);
    }
    if (filters?.category) {
      where += ` AND pm.category = $${paramIdx++}`;
      params.push(filters.category);
    }
    if (filters?.platform) {
      where += ` AND s.source_platform = $${paramIdx++}`;
      params.push(filters.platform);
    }
    if (filters?.contentTag) {
      where += ` AND pm.content_tags LIKE $${paramIdx++}`;
      params.push(`%"${filters.contentTag}"%`);
    }
    if (filters?.patternTag) {
      where += ` AND pm.pattern_tags LIKE $${paramIdx++}`;
      params.push(`%"${filters.patternTag}"%`);
    }
    const { rows } = await pool.query(`
      SELECT rc.primary_vendor, COUNT(*) AS count
      FROM ${T_RESPONSE_CONTEXT} rc
      JOIN ${T_SESSIONS} s ON rc.session_id = s.id
      LEFT JOIN ${T_PROMPT_METADATA} pm ON rc.prompt_id = pm.prompt_id
      WHERE ${where}
      GROUP BY rc.primary_vendor
      ORDER BY count DESC
    `, params);
    return rows.map((r: Record<string, unknown>) => ({
      primary_vendor: r.primary_vendor as string,
      count: Number(r.count),
    }));
  } catch { return []; }
}

// ── Enrichment: Constraint Coverage Stats ──────────────────────────

export interface ConstraintCoverageRow {
  constraint: string;
  addressed_count: number;
  total_count: number;
  coverage_pct: number;
}

export async function getConstraintCoverage(promptId?: string): Promise<ConstraintCoverageRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT)) || !(await hasTable(pool, T_PROMPT_METADATA))) return [];

    let metaQuery = `SELECT prompt_id, constraints FROM ${T_PROMPT_METADATA}`;
    const metaParams: string[] = [];
    if (promptId) {
      metaQuery += " WHERE prompt_id = $1";
      metaParams.push(promptId);
    }
    const { rows: metas } = await pool.query(metaQuery, metaParams);

    let rcQuery = `SELECT prompt_id, constraints_addressed FROM ${T_RESPONSE_CONTEXT}`;
    const rcParams: string[] = [];
    if (promptId) {
      rcQuery += " WHERE prompt_id = $1";
      rcParams.push(promptId);
    }
    const { rows: contexts } = await pool.query(rcQuery, rcParams);

    const constraintTotals = new Map<string, number>();
    const constraintAddressed = new Map<string, number>();

    for (const meta of metas as Array<{ prompt_id: string; constraints: string }>) {
      try {
        const constraints = JSON.parse(meta.constraints) as string[];
        const responseCount = (contexts as Array<{ prompt_id: string }>).filter(c => c.prompt_id === meta.prompt_id).length;
        for (const c of constraints) {
          constraintTotals.set(c, (constraintTotals.get(c) || 0) + responseCount);
        }
      } catch { /* skip bad JSON */ }
    }

    for (const ctx of contexts as Array<{ prompt_id: string; constraints_addressed: string }>) {
      try {
        const addressed = JSON.parse(ctx.constraints_addressed) as string[];
        for (const c of addressed) {
          constraintAddressed.set(c, (constraintAddressed.get(c) || 0) + 1);
        }
      } catch { /* skip bad JSON */ }
    }

    const result: ConstraintCoverageRow[] = [];
    for (const [constraint, total] of constraintTotals.entries()) {
      const addressed = constraintAddressed.get(constraint) || 0;
      result.push({
        constraint,
        addressed_count: addressed,
        total_count: total,
        coverage_pct: total > 0 ? addressed / total : 0,
      });
    }

    return result.sort((a, b) => b.coverage_pct - a.coverage_pct);
  } catch { return []; }
}

// ── Enrichment: Prompt-Level Summary ───────────────────────────────

export interface PromptEnrichmentSummary {
  prompt_id: string;
  category: string;
  content_tags: string[];
  pattern_tags: string[];
  constraints: string[];
  response_count: number;
  primary_vendors: Record<string, number>;
  avg_constraints_covered: number;
  implementation_rate: number;
}

export async function getPromptEnrichmentSummaries(vendorScope?: string | null): Promise<PromptEnrichmentSummary[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT)) || !(await hasTable(pool, T_PROMPT_METADATA))) return [];

    const { rows: metas } = await pool.query(`SELECT * FROM ${T_PROMPT_METADATA} ORDER BY prompt_id`);
    const rcQuery = vendorScope
      ? `SELECT * FROM ${T_RESPONSE_CONTEXT} WHERE primary_vendor = $1`
      : `SELECT * FROM ${T_RESPONSE_CONTEXT}`;
    const rcParams = vendorScope ? [vendorScope] : [];
    const { rows: allContexts } = await pool.query(rcQuery, rcParams);

    const results: PromptEnrichmentSummary[] = [];

    for (const meta of metas as PromptMetadataWebRow[]) {
      const contexts = (allContexts as ResponseContextWebRow[]).filter(c => c.prompt_id === meta.prompt_id);
      const constraints = safeJsonParse<string[]>(meta.constraints, []);
      const vendorCounts: Record<string, number> = {};
      let totalConstraintsCovered = 0;
      let implementedCount = 0;

      for (const ctx of contexts) {
        if (ctx.primary_vendor) {
          vendorCounts[ctx.primary_vendor] = (vendorCounts[ctx.primary_vendor] || 0) + 1;
        }
        const addressed = safeJsonParse<string[]>(ctx.constraints_addressed, []);
        totalConstraintsCovered += addressed.length;
        if (ctx.is_implemented) implementedCount++;
      }

      results.push({
        prompt_id: meta.prompt_id,
        category: meta.category,
        content_tags: safeJsonParse<string[]>(meta.content_tags, []),
        pattern_tags: safeJsonParse<string[]>(meta.pattern_tags, []),
        constraints,
        response_count: contexts.length,
        primary_vendors: vendorCounts,
        avg_constraints_covered: contexts.length > 0 ? totalConstraintsCovered / contexts.length : 0,
        implementation_rate: contexts.length > 0 ? implementedCount / contexts.length : 0,
      });
    }

    return results;
  } catch { return []; }
}

// ── Vendor Intelligence ─────────────────────────────────────────────

export interface VendorScorecard {
  vendor: string;
  totalRecommendations: number;
  totalMentions: number;
  winRate: number;
  implementationRate: number;
  categoryBreakdown: Array<{
    category: string;
    recommendations: number;
    rejections: number;
    comparisons: number;
    totalInCategory: number;
  }>;
  platformSplit: Record<string, number>;
  constraintsAddressed: Array<{ constraint: string; count: number }>;
  constraintsMissed: Array<{ constraint: string; count: number }>;
  competitorWins: Array<{ competitor: string; count: number; scenarios: string[] }>;
  tradeOffSnippets: string[];
  gotchaSnippets: string[];
  rationaleSnippets: string[];
  promptsWon: Array<{ prompt_id: string; category: string }>;
  promptsLost: Array<{ prompt_id: string; category: string; winner: string }>;
  lossContext: Array<{
    prompt_id: string;
    category: string;
    winner: string;
    winnerConstraintsAddressed: string[];
    promptConstraints: string[];
    platform: string;
  }>;
  implementationContext: Array<{
    prompt_id: string;
    category: string;
    platform: string;
    isImplemented: boolean;
  }>;
  allPromptConstraints: Record<string, string[]>;
}

export async function getVendorScorecard(vendor: string): Promise<VendorScorecard | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT)) || !(await hasTable(pool, T_PROMPT_METADATA))) return null;

    const { rows: allResponses } = await pool.query(`
      SELECT rc.*, s.source_platform, pm.category, pm.constraints
      FROM ${T_RESPONSE_CONTEXT} rc
      JOIN ${T_SESSIONS} s ON rc.session_id = s.id
      LEFT JOIN ${T_PROMPT_METADATA} pm ON rc.prompt_id = pm.prompt_id
    `);

    type ResponseRow = ResponseContextWebRow & { source_platform: string; category: string; constraints: string };

    const mentionedIn: ResponseRow[] = [];
    const recommendedIn: ResponseRow[] = [];
    const rejectedIn: ResponseRow[] = [];
    const comparedIn: ResponseRow[] = [];
    let implementedCount = 0;

    for (const r of allResponses as ResponseRow[]) {
      const vendors = safeJsonParse<Array<{ vendor: string; disposition: string }>>(r.vendors_mentioned, []);
      const vendorEntry = vendors.find(v => v.vendor === vendor);
      const isPrimary = r.primary_vendor === vendor;

      if (isPrimary || vendorEntry) {
        mentionedIn.push(r);
        if (isPrimary) {
          recommendedIn.push(r);
          if (r.is_implemented) implementedCount++;
        }
        if (vendorEntry?.disposition === "rejected") rejectedIn.push(r);
        if (vendorEntry?.disposition === "compared") comparedIn.push(r);
      }
    }

    if (mentionedIn.length === 0) return null;

    // Category breakdown
    const catMap = new Map<string, { recommendations: number; rejections: number; comparisons: number; total: number }>();
    for (const r of mentionedIn) {
      const cat = r.category || "unknown";
      if (!catMap.has(cat)) catMap.set(cat, { recommendations: 0, rejections: 0, comparisons: 0, total: 0 });
      const entry = catMap.get(cat)!;
      entry.total++;
      if (r.primary_vendor === vendor) entry.recommendations++;
    }
    for (const r of rejectedIn) {
      const cat = r.category || "unknown";
      catMap.get(cat)!.rejections++;
    }
    for (const r of comparedIn) {
      const cat = r.category || "unknown";
      if (catMap.has(cat)) catMap.get(cat)!.comparisons++;
    }

    const categoryBreakdown = Array.from(catMap.entries()).map(([category, data]) => ({
      category,
      recommendations: data.recommendations,
      rejections: data.rejections,
      comparisons: data.comparisons,
      totalInCategory: data.total,
    })).sort((a, b) => b.recommendations - a.recommendations);

    // Platform split
    const platformSplit: Record<string, number> = {};
    for (const r of recommendedIn) {
      platformSplit[r.source_platform] = (platformSplit[r.source_platform] || 0) + 1;
    }

    // Constraints addressed (when this vendor wins)
    const addressedMap = new Map<string, number>();
    for (const r of recommendedIn) {
      const addressed = safeJsonParse<string[]>(r.constraints_addressed, []);
      for (const c of addressed) {
        addressedMap.set(c, (addressedMap.get(c) || 0) + 1);
      }
    }
    const constraintsAddressed = Array.from(addressedMap.entries())
      .map(([constraint, count]) => ({ constraint, count }))
      .sort((a, b) => b.count - a.count);

    // Constraints missed
    const missedMap = new Map<string, number>();
    for (const r of mentionedIn) {
      if (r.primary_vendor !== vendor) {
        const constraints = safeJsonParse<string[]>(r.constraints, []);
        for (const c of constraints) {
          missedMap.set(c, (missedMap.get(c) || 0) + 1);
        }
      }
    }
    const constraintsMissed = Array.from(missedMap.entries())
      .map(([constraint, count]) => ({ constraint, count }))
      .sort((a, b) => b.count - a.count);

    // Competitor wins
    const competitorMap = new Map<string, { count: number; scenarios: Set<string> }>();
    for (const r of mentionedIn) {
      if (r.primary_vendor && r.primary_vendor !== vendor) {
        const comp = r.primary_vendor;
        if (!competitorMap.has(comp)) competitorMap.set(comp, { count: 0, scenarios: new Set() });
        const entry = competitorMap.get(comp)!;
        entry.count++;
        entry.scenarios.add(r.prompt_id);
      }
    }
    const competitorWins = Array.from(competitorMap.entries())
      .map(([competitor, data]) => ({ competitor, count: data.count, scenarios: Array.from(data.scenarios) }))
      .sort((a, b) => b.count - a.count);

    // Snippets
    const tradeOffSnippets = (allResponses as ResponseRow[])
      .filter(r => r.primary_vendor === vendor && r.trade_offs_snippet)
      .map(r => r.trade_offs_snippet!)
      .filter(s => s.length > 5);
    const gotchaSnippets = (allResponses as ResponseRow[])
      .filter(r => r.primary_vendor === vendor && r.gotchas_snippet)
      .map(r => r.gotchas_snippet!)
      .filter(s => s.length > 5);
    const rationaleSnippets = (allResponses as ResponseRow[])
      .filter(r => r.primary_vendor === vendor && r.rationale_snippet)
      .map(r => r.rationale_snippet!)
      .filter(s => s.length > 5);

    // Prompts won and lost
    const promptsWon = recommendedIn.map(r => ({ prompt_id: r.prompt_id, category: r.category || "unknown" }));
    const promptsLost: Array<{ prompt_id: string; category: string; winner: string }> = [];
    for (const r of mentionedIn) {
      if (r.primary_vendor && r.primary_vendor !== vendor) {
        promptsLost.push({ prompt_id: r.prompt_id, category: r.category || "unknown", winner: r.primary_vendor });
      }
    }

    // Loss context
    const lossContext: VendorScorecard["lossContext"] = [];
    for (const r of mentionedIn) {
      if (r.primary_vendor && r.primary_vendor !== vendor) {
        const winnerResponse = (allResponses as ResponseRow[]).find(
          wr => wr.prompt_id === r.prompt_id && wr.primary_vendor === r.primary_vendor
        );
        const winnerConstraints = winnerResponse
          ? safeJsonParse<string[]>(winnerResponse.constraints_addressed, [])
          : [];
        lossContext.push({
          prompt_id: r.prompt_id,
          category: r.category || "unknown",
          winner: r.primary_vendor,
          winnerConstraintsAddressed: winnerConstraints,
          promptConstraints: safeJsonParse<string[]>(r.constraints, []),
          platform: r.source_platform,
        });
      }
    }

    // Implementation context
    const implementationContext: VendorScorecard["implementationContext"] = [];
    for (const r of recommendedIn) {
      implementationContext.push({
        prompt_id: r.prompt_id,
        category: r.category || "unknown",
        platform: r.source_platform,
        isImplemented: !!r.is_implemented,
      });
    }

    // All prompt constraints
    const allPromptConstraints: Record<string, string[]> = {};
    for (const r of mentionedIn) {
      if (!allPromptConstraints[r.prompt_id]) {
        allPromptConstraints[r.prompt_id] = safeJsonParse<string[]>(r.constraints, []);
      }
    }

    return {
      vendor,
      totalRecommendations: recommendedIn.length,
      totalMentions: mentionedIn.length,
      winRate: mentionedIn.length > 0 ? recommendedIn.length / mentionedIn.length : 0,
      implementationRate: recommendedIn.length > 0 ? implementedCount / recommendedIn.length : 0,
      categoryBreakdown,
      platformSplit,
      constraintsAddressed,
      constraintsMissed,
      competitorWins,
      tradeOffSnippets,
      gotchaSnippets,
      rationaleSnippets,
      promptsWon,
      promptsLost,
      lossContext,
      implementationContext,
      allPromptConstraints,
    };
  } catch { return null; }
}

export async function getAllVendorScorecards(): Promise<VendorScorecard[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT)) || !(await hasTable(pool, T_PROMPT_METADATA))) return [];

    const { rows: allResponses } = await pool.query(`
      SELECT rc.*, s.source_platform, pm.category, pm.constraints
      FROM ${T_RESPONSE_CONTEXT} rc
      JOIN ${T_SESSIONS} s ON rc.session_id = s.id
      LEFT JOIN ${T_PROMPT_METADATA} pm ON rc.prompt_id = pm.prompt_id
    `);

    type ResponseRow = ResponseContextWebRow & { source_platform: string; category: string; constraints: string };

    // Index responses by vendor involvement
    const vendorResponses = new Map<string, {
      mentionedIn: ResponseRow[];
      recommendedIn: ResponseRow[];
      rejectedIn: ResponseRow[];
      comparedIn: ResponseRow[];
      implementedCount: number;
    }>();

    function ensureVendor(v: string) {
      if (!vendorResponses.has(v)) {
        vendorResponses.set(v, { mentionedIn: [], recommendedIn: [], rejectedIn: [], comparedIn: [], implementedCount: 0 });
      }
      return vendorResponses.get(v)!;
    }

    for (const r of allResponses as ResponseRow[]) {
      const vendors = safeJsonParse<Array<{ vendor: string; disposition: string }>>(r.vendors_mentioned, []);

      if (r.primary_vendor) {
        const entry = ensureVendor(r.primary_vendor);
        entry.mentionedIn.push(r);
        entry.recommendedIn.push(r);
        if (r.is_implemented) entry.implementedCount++;
      }

      for (const v of vendors) {
        if (v.vendor === r.primary_vendor) continue;
        const entry = ensureVendor(v.vendor);
        entry.mentionedIn.push(r);
        if (v.disposition === "rejected") entry.rejectedIn.push(r);
        if (v.disposition === "compared") entry.comparedIn.push(r);
      }
    }

    // Build scorecards for each vendor
    const scorecards: VendorScorecard[] = [];

    for (const [vendor, data] of vendorResponses) {
      if (data.mentionedIn.length === 0) continue;

      const { mentionedIn, recommendedIn, rejectedIn, comparedIn, implementedCount } = data;

      // Category breakdown
      const catMap = new Map<string, { recommendations: number; rejections: number; comparisons: number; total: number }>();
      for (const r of mentionedIn) {
        const cat = r.category || "unknown";
        if (!catMap.has(cat)) catMap.set(cat, { recommendations: 0, rejections: 0, comparisons: 0, total: 0 });
        const entry = catMap.get(cat)!;
        entry.total++;
        if (r.primary_vendor === vendor) entry.recommendations++;
      }
      for (const r of rejectedIn) {
        const cat = r.category || "unknown";
        catMap.get(cat)!.rejections++;
      }
      for (const r of comparedIn) {
        const cat = r.category || "unknown";
        if (catMap.has(cat)) catMap.get(cat)!.comparisons++;
      }

      const categoryBreakdown = Array.from(catMap.entries()).map(([category, d]) => ({
        category,
        recommendations: d.recommendations,
        rejections: d.rejections,
        comparisons: d.comparisons,
        totalInCategory: d.total,
      })).sort((a, b) => b.recommendations - a.recommendations);

      // Platform split
      const platformSplit: Record<string, number> = {};
      for (const r of recommendedIn) {
        platformSplit[r.source_platform] = (platformSplit[r.source_platform] || 0) + 1;
      }

      // Constraints addressed
      const addressedMap = new Map<string, number>();
      for (const r of recommendedIn) {
        for (const c of safeJsonParse<string[]>(r.constraints_addressed, [])) {
          addressedMap.set(c, (addressedMap.get(c) || 0) + 1);
        }
      }
      const constraintsAddressed = Array.from(addressedMap.entries())
        .map(([constraint, count]) => ({ constraint, count }))
        .sort((a, b) => b.count - a.count);

      // Constraints missed
      const missedMap = new Map<string, number>();
      for (const r of mentionedIn) {
        if (r.primary_vendor !== vendor) {
          for (const c of safeJsonParse<string[]>(r.constraints, [])) {
            missedMap.set(c, (missedMap.get(c) || 0) + 1);
          }
        }
      }
      const constraintsMissed = Array.from(missedMap.entries())
        .map(([constraint, count]) => ({ constraint, count }))
        .sort((a, b) => b.count - a.count);

      // Competitor wins
      const competitorMap = new Map<string, { count: number; scenarios: Set<string> }>();
      for (const r of mentionedIn) {
        if (r.primary_vendor && r.primary_vendor !== vendor) {
          if (!competitorMap.has(r.primary_vendor)) competitorMap.set(r.primary_vendor, { count: 0, scenarios: new Set() });
          const entry = competitorMap.get(r.primary_vendor)!;
          entry.count++;
          entry.scenarios.add(r.prompt_id);
        }
      }
      const competitorWins = Array.from(competitorMap.entries())
        .map(([competitor, d]) => ({ competitor, count: d.count, scenarios: Array.from(d.scenarios) }))
        .sort((a, b) => b.count - a.count);

      // Snippets
      const tradeOffSnippets = recommendedIn.filter(r => r.trade_offs_snippet).map(r => r.trade_offs_snippet!).filter(s => s.length > 5);
      const gotchaSnippets = recommendedIn.filter(r => r.gotchas_snippet).map(r => r.gotchas_snippet!).filter(s => s.length > 5);
      const rationaleSnippets = recommendedIn.filter(r => r.rationale_snippet).map(r => r.rationale_snippet!).filter(s => s.length > 5);

      // Prompts won and lost
      const promptsWon = recommendedIn.map(r => ({ prompt_id: r.prompt_id, category: r.category || "unknown" }));
      const promptsLost: Array<{ prompt_id: string; category: string; winner: string }> = [];
      for (const r of mentionedIn) {
        if (r.primary_vendor && r.primary_vendor !== vendor) {
          promptsLost.push({ prompt_id: r.prompt_id, category: r.category || "unknown", winner: r.primary_vendor });
        }
      }

      // Loss context -- use a quick index for winner responses
      const lossContext: VendorScorecard["lossContext"] = [];
      for (const r of mentionedIn) {
        if (r.primary_vendor && r.primary_vendor !== vendor) {
          const winnerData = vendorResponses.get(r.primary_vendor);
          const winnerResponse = winnerData?.recommendedIn.find(
            wr => wr.prompt_id === r.prompt_id
          );
          const winnerConstraints = winnerResponse
            ? safeJsonParse<string[]>(winnerResponse.constraints_addressed, [])
            : [];
          lossContext.push({
            prompt_id: r.prompt_id,
            category: r.category || "unknown",
            winner: r.primary_vendor,
            winnerConstraintsAddressed: winnerConstraints,
            promptConstraints: safeJsonParse<string[]>(r.constraints, []),
            platform: r.source_platform,
          });
        }
      }

      // Implementation context
      const implementationContext: VendorScorecard["implementationContext"] = recommendedIn.map(r => ({
        prompt_id: r.prompt_id,
        category: r.category || "unknown",
        platform: r.source_platform,
        isImplemented: !!r.is_implemented,
      }));

      // All prompt constraints
      const allPromptConstraints: Record<string, string[]> = {};
      for (const r of mentionedIn) {
        if (!allPromptConstraints[r.prompt_id]) {
          allPromptConstraints[r.prompt_id] = safeJsonParse<string[]>(r.constraints, []);
        }
      }

      scorecards.push({
        vendor,
        totalRecommendations: recommendedIn.length,
        totalMentions: mentionedIn.length,
        winRate: mentionedIn.length > 0 ? recommendedIn.length / mentionedIn.length : 0,
        implementationRate: recommendedIn.length > 0 ? implementedCount / recommendedIn.length : 0,
        categoryBreakdown,
        platformSplit,
        constraintsAddressed,
        constraintsMissed,
        competitorWins,
        tradeOffSnippets,
        gotchaSnippets,
        rationaleSnippets,
        promptsWon,
        promptsLost,
        lossContext,
        implementationContext,
        allPromptConstraints,
      });
    }

    return scorecards;
  } catch { return []; }
}

export interface VendorListItem {
  vendor: string;
  totalRecommendations: number;
  totalMentions: number;
  winRate: number;
  implementationRate: number;
  topCategory: string | null;
  platforms: string[];
}

export async function getAllVendorNames(): Promise<VendorListItem[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT)) || !(await hasTable(pool, T_PROMPT_METADATA))) return [];

    const { rows: allResponses } = await pool.query(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, rc.is_implemented,
             s.source_platform, pm.category
      FROM ${T_RESPONSE_CONTEXT} rc
      JOIN ${T_SESSIONS} s ON rc.session_id = s.id
      LEFT JOIN ${T_PROMPT_METADATA} pm ON rc.prompt_id = pm.prompt_id
    `);

    const vendorMap = new Map<string, {
      recommendations: number;
      mentions: number;
      implementations: number;
      categories: Record<string, number>;
      platforms: Set<string>;
    }>();

    function ensureVendor(v: string) {
      if (!vendorMap.has(v)) {
        vendorMap.set(v, { recommendations: 0, mentions: 0, implementations: 0, categories: {}, platforms: new Set() });
      }
      return vendorMap.get(v)!;
    }

    for (const r of allResponses as Array<{
      primary_vendor: string | null;
      vendors_mentioned: string;
      is_implemented: boolean;
      source_platform: string;
      category: string;
    }>) {
      if (r.primary_vendor) {
        const entry = ensureVendor(r.primary_vendor);
        entry.recommendations++;
        entry.mentions++;
        entry.platforms.add(r.source_platform);
        if (r.category) {
          entry.categories[r.category] = (entry.categories[r.category] || 0) + 1;
        }
        if (r.is_implemented) entry.implementations++;
      }

      const vendors = safeJsonParse<Array<{ vendor: string; disposition: string }>>(r.vendors_mentioned, []);
      for (const v of vendors) {
        if (v.vendor === r.primary_vendor) continue;
        const entry = ensureVendor(v.vendor);
        entry.mentions++;
        entry.platforms.add(r.source_platform);
        if (r.category) {
          entry.categories[r.category] = (entry.categories[r.category] || 0) + 1;
        }
      }
    }

    return Array.from(vendorMap.entries()).map(([vendor, data]) => {
      const topCat = Object.entries(data.categories).sort((a, b) => b[1] - a[1])[0];
      return {
        vendor,
        totalRecommendations: data.recommendations,
        totalMentions: data.mentions,
        winRate: data.mentions > 0 ? data.recommendations / data.mentions : 0,
        implementationRate: data.recommendations > 0 ? data.implementations / data.recommendations : 0,
        topCategory: topCat?.[0] ?? null,
        platforms: Array.from(data.platforms),
      };
    }).sort((a, b) => b.totalRecommendations - a.totalRecommendations || b.totalMentions - a.totalMentions);
  } catch { return []; }
}

export interface HeadToHeadResult {
  vendorA: string;
  vendorB: string;
  scenarios: Array<{
    prompt_id: string;
    category: string;
    winner: string | null;
    rationale: string | null;
  }>;
  aWins: number;
  bWins: number;
  ties: number;
}

export async function getVendorHeadToHead(vendorA: string, vendorB: string): Promise<HeadToHeadResult> {
  const pool = getPool();
  const empty: HeadToHeadResult = { vendorA, vendorB, scenarios: [], aWins: 0, bWins: 0, ties: 0 };
  if (!pool) return empty;
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT)) || !(await hasTable(pool, T_PROMPT_METADATA))) return empty;

    const { rows: allResponses } = await pool.query(`
      SELECT rc.prompt_id, rc.primary_vendor, rc.vendors_mentioned, rc.rationale_snippet,
             pm.category
      FROM ${T_RESPONSE_CONTEXT} rc
      LEFT JOIN ${T_PROMPT_METADATA} pm ON rc.prompt_id = pm.prompt_id
    `);

    const scenarios: HeadToHeadResult["scenarios"] = [];
    let aWins = 0, bWins = 0, ties = 0;

    for (const r of allResponses as Array<{
      prompt_id: string;
      primary_vendor: string | null;
      vendors_mentioned: string;
      rationale_snippet: string | null;
      category: string;
    }>) {
      const vendors = safeJsonParse<Array<{ vendor: string; disposition: string }>>(r.vendors_mentioned, []);
      const allVendors = new Set([r.primary_vendor, ...vendors.map(v => v.vendor)].filter(Boolean));

      if (allVendors.has(vendorA) && allVendors.has(vendorB)) {
        let winner: string | null = null;
        if (r.primary_vendor === vendorA) { winner = vendorA; aWins++; }
        else if (r.primary_vendor === vendorB) { winner = vendorB; bWins++; }
        else { ties++; }

        scenarios.push({
          prompt_id: r.prompt_id,
          category: r.category || "unknown",
          winner,
          rationale: r.rationale_snippet,
        });
      }
    }

    return { vendorA, vendorB, scenarios, aWins, bWins, ties };
  } catch { return empty; }
}

// ── Enrichment: Category Summaries ─────────────────────────────────

export interface CategorySummary {
  category: string;
  prompt_count: number;
  response_count: number;
  top_vendor: string | null;
  top_vendor_count: number;
  avg_constraint_coverage: number;
  total_constraints: number;
}

export async function getCategorySummaries(): Promise<CategorySummary[]> {
  const summaries = await getPromptEnrichmentSummaries();
  if (summaries.length === 0) return [];

  const catMap = new Map<string, {
    prompts: PromptEnrichmentSummary[];
    vendorCounts: Record<string, number>;
    totalConstraints: number;
    totalConstraintsCovered: number;
    totalResponses: number;
  }>();

  for (const s of summaries) {
    if (!catMap.has(s.category)) {
      catMap.set(s.category, { prompts: [], vendorCounts: {}, totalConstraints: 0, totalConstraintsCovered: 0, totalResponses: 0 });
    }
    const cat = catMap.get(s.category)!;
    cat.prompts.push(s);
    cat.totalResponses += s.response_count;
    cat.totalConstraints += s.constraints.length;
    cat.totalConstraintsCovered += s.avg_constraints_covered * s.response_count;
    for (const [vendor, count] of Object.entries(s.primary_vendors)) {
      cat.vendorCounts[vendor] = (cat.vendorCounts[vendor] || 0) + count;
    }
  }

  const results: CategorySummary[] = [];
  for (const [category, data] of catMap.entries()) {
    const topEntry = Object.entries(data.vendorCounts).sort((a, b) => b[1] - a[1])[0];
    const totalPossibleConstraints = data.totalConstraints * (data.totalResponses / data.prompts.length || 1);
    results.push({
      category,
      prompt_count: data.prompts.length,
      response_count: data.totalResponses,
      top_vendor: topEntry?.[0] ?? null,
      top_vendor_count: topEntry?.[1] ?? 0,
      avg_constraint_coverage: data.totalResponses > 0 ? data.totalConstraintsCovered / data.totalResponses : 0,
      total_constraints: data.totalConstraints,
    });
  }

  return results.sort((a, b) => b.response_count - a.response_count);
}

// ── Enrichment: Category Detail ────────────────────────────────────

export interface CategoryDetail {
  prompts: PromptEnrichmentSummary[];
  promptMetadata: PromptMetadataWebRow[];
  responses: (ResponseContextWebRow & { source_platform?: string })[];
  vendorCounts: PrimaryVendorCountRow[];
  constraintCoverage: ConstraintCoverageRow[];
}

export async function getEnrichmentByCategory(category: string): Promise<CategoryDetail> {
  const allSummaries = await getPromptEnrichmentSummaries();
  const prompts = allSummaries.filter(s => s.category === category);

  const pool = getPool();
  if (!pool || prompts.length === 0) {
    return { prompts, promptMetadata: [], responses: [], vendorCounts: [], constraintCoverage: [] };
  }

  try {
    if (!(await hasTable(pool, T_PROMPT_METADATA)) || !(await hasTable(pool, T_RESPONSE_CONTEXT))) {
      return { prompts, promptMetadata: [], responses: [], vendorCounts: [], constraintCoverage: [] };
    }

    const promptIds = prompts.map(p => p.prompt_id);
    const placeholders = promptIds.map((_, i) => `$${i + 1}`).join(",");

    const { rows: promptMetadata } = await pool.query(
      `SELECT * FROM ${T_PROMPT_METADATA} WHERE category = $1 ORDER BY prompt_id`,
      [category],
    );

    const { rows: responses } = await pool.query(
      `SELECT rc.*, s.source_platform
       FROM ${T_RESPONSE_CONTEXT} rc
       JOIN ${T_SESSIONS} s ON rc.session_id = s.id
       WHERE rc.prompt_id IN (${placeholders})
       ORDER BY rc.prompt_id, s.source_platform`,
      promptIds,
    );

    const vendorCounts = await getPrimaryVendorCounts({ category });
    const constraintCoverage = getConstraintCoverageForCategory(category, promptMetadata as PromptMetadataWebRow[], responses as ResponseContextWebRow[]);

    return { prompts, promptMetadata: promptMetadata as PromptMetadataWebRow[], responses: responses as (ResponseContextWebRow & { source_platform: string })[], vendorCounts, constraintCoverage };
  } catch {
    return { prompts, promptMetadata: [], responses: [], vendorCounts: [], constraintCoverage: [] };
  }
}

// ── Temporal Trends ─────────────────────────────────────────────────

export interface TrendDataPoint {
  weekStart: string;
  recommendations: number;
  mentions: number;
  winRate: number;
}

export interface VendorTrend {
  vendor: string;
  dataPoints: TrendDataPoint[];
  currentWinRate: number;
  previousWinRate: number;
  winRateDelta: number;
  currentMentions: number;
  previousMentions: number;
  mentionDelta: number;
  trend: "rising" | "falling" | "stable";
}

export async function getVendorTrend(vendor: string, windowDays = 60): Promise<VendorTrend | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT)) || !(await hasTable(pool, T_PROMPT_METADATA))) return null;

    const { rows: allResponses } = await pool.query(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, rc.extracted_at,
             s.started_at, s.source_platform
      FROM ${T_RESPONSE_CONTEXT} rc
      JOIN ${T_SESSIONS} s ON rc.session_id = s.id
      WHERE rc.extracted_at >= (NOW() - $1::interval)::text
         OR s.started_at >= (NOW() - $1::interval)::text
    `, [`${windowDays} days`]);

    // Group by week
    const weekMap = new Map<string, { recommendations: number; mentions: number }>();

    for (const r of allResponses as Array<{
      primary_vendor: string | null;
      vendors_mentioned: string;
      extracted_at: string;
      started_at: string;
      source_platform: string;
    }>) {
      const dateStr = r.extracted_at || r.started_at;
      if (!dateStr) continue;

      const date = new Date(dateStr);
      const day = date.getDay();
      const monday = new Date(date);
      monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
      const weekKey = monday.toISOString().slice(0, 10);

      const isPrimary = r.primary_vendor === vendor;
      const vendors = safeJsonParse<Array<{ vendor: string; disposition: string }>>(r.vendors_mentioned, []);
      const isMentioned = isPrimary || vendors.some(v => v.vendor === vendor);

      if (!isMentioned) continue;

      if (!weekMap.has(weekKey)) weekMap.set(weekKey, { recommendations: 0, mentions: 0 });
      const entry = weekMap.get(weekKey)!;
      entry.mentions++;
      if (isPrimary) entry.recommendations++;
    }

    const dataPoints: TrendDataPoint[] = Array.from(weekMap.entries())
      .map(([weekStart, data]) => ({
        weekStart,
        recommendations: data.recommendations,
        mentions: data.mentions,
        winRate: data.mentions > 0 ? data.recommendations / data.mentions : 0,
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    if (dataPoints.length === 0) return null;

    const mid = Math.ceil(dataPoints.length / 2);
    const firstHalf = dataPoints.slice(0, mid);
    const secondHalf = dataPoints.slice(mid);

    const avgWinRate = (pts: TrendDataPoint[]) => {
      const totalMentions = pts.reduce((s, p) => s + p.mentions, 0);
      const totalRecs = pts.reduce((s, p) => s + p.recommendations, 0);
      return totalMentions > 0 ? totalRecs / totalMentions : 0;
    };

    const totalMentions = (pts: TrendDataPoint[]) => pts.reduce((s, p) => s + p.mentions, 0);

    const prevWR = avgWinRate(firstHalf);
    const currWR = avgWinRate(secondHalf.length > 0 ? secondHalf : firstHalf);
    const prevMen = totalMentions(firstHalf);
    const currMen = totalMentions(secondHalf.length > 0 ? secondHalf : firstHalf);

    const delta = currWR - prevWR;
    const trend: "rising" | "falling" | "stable" =
      delta > 0.05 ? "rising" : delta < -0.05 ? "falling" : "stable";

    return {
      vendor,
      dataPoints,
      currentWinRate: currWR,
      previousWinRate: prevWR,
      winRateDelta: delta,
      currentMentions: currMen,
      previousMentions: prevMen,
      mentionDelta: currMen - prevMen,
      trend,
    };
  } catch { return null; }
}

export async function getAllVendorTrends(): Promise<VendorTrend[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT))) return [];

    const { rows: allResponses } = await pool.query(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, rc.extracted_at,
             s.started_at
      FROM ${T_RESPONSE_CONTEXT} rc
      JOIN ${T_SESSIONS} s ON rc.session_id = s.id
    `);

    // Build per-vendor week maps in a single pass over the data
    const vendorWeekMaps = new Map<string, Map<string, { recommendations: number; mentions: number }>>();

    function ensureVendorWeek(vendor: string, weekKey: string) {
      if (!vendorWeekMaps.has(vendor)) vendorWeekMaps.set(vendor, new Map());
      const weekMap = vendorWeekMaps.get(vendor)!;
      if (!weekMap.has(weekKey)) weekMap.set(weekKey, { recommendations: 0, mentions: 0 });
      return weekMap.get(weekKey)!;
    }

    for (const r of allResponses as Array<{
      primary_vendor: string | null;
      vendors_mentioned: string;
      extracted_at: string;
      started_at: string;
    }>) {
      const dateStr = r.extracted_at || r.started_at;
      if (!dateStr) continue;

      const date = new Date(dateStr);
      const day = date.getDay();
      const monday = new Date(date);
      monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
      const weekKey = monday.toISOString().slice(0, 10);

      // Track primary vendor
      if (r.primary_vendor) {
        const entry = ensureVendorWeek(r.primary_vendor, weekKey);
        entry.recommendations++;
        entry.mentions++;
      }

      // Track mentioned vendors
      const vendors = safeJsonParse<Array<{ vendor: string; disposition: string }>>(r.vendors_mentioned, []);
      for (const v of vendors) {
        if (v.vendor === r.primary_vendor) continue;
        const entry = ensureVendorWeek(v.vendor, weekKey);
        entry.mentions++;
      }
    }

    // Compute trends from the per-vendor week maps
    const trends: VendorTrend[] = [];
    for (const [vendor, weekMap] of vendorWeekMaps) {
      const dataPoints: TrendDataPoint[] = Array.from(weekMap.entries())
        .map(([weekStart, data]) => ({
          weekStart,
          recommendations: data.recommendations,
          mentions: data.mentions,
          winRate: data.mentions > 0 ? data.recommendations / data.mentions : 0,
        }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

      if (dataPoints.length === 0) continue;

      const mid = Math.ceil(dataPoints.length / 2);
      const firstHalf = dataPoints.slice(0, mid);
      const secondHalf = dataPoints.slice(mid);

      const avgWinRate = (pts: TrendDataPoint[]) => {
        const totalMentions = pts.reduce((s, p) => s + p.mentions, 0);
        const totalRecs = pts.reduce((s, p) => s + p.recommendations, 0);
        return totalMentions > 0 ? totalRecs / totalMentions : 0;
      };
      const totalMentions = (pts: TrendDataPoint[]) => pts.reduce((s, p) => s + p.mentions, 0);

      const prevWR = avgWinRate(firstHalf);
      const currWR = avgWinRate(secondHalf.length > 0 ? secondHalf : firstHalf);
      const prevMen = totalMentions(firstHalf);
      const currMen = totalMentions(secondHalf.length > 0 ? secondHalf : firstHalf);

      const delta = currWR - prevWR;
      const trend: "rising" | "falling" | "stable" =
        delta > 0.05 ? "rising" : delta < -0.05 ? "falling" : "stable";

      trends.push({
        vendor,
        dataPoints,
        currentWinRate: currWR,
        previousWinRate: prevWR,
        winRateDelta: delta,
        currentMentions: currMen,
        previousMentions: prevMen,
        mentionDelta: currMen - prevMen,
        trend,
      });
    }

    return trends;
  } catch { return []; }
}

// ── Prompt Intelligence ─────────────────────────────────────────────

export interface PromptLeaderboardRow {
  prompt_id: string;
  category: string;
  response_count: number;
  top_vendor: string | null;
  top_vendor_count: number;
  unique_vendors: number;
  implementation_rate: number;
  avg_constraints_covered: number;
  total_constraints: number;
  is_contested: boolean;
  is_dominated: boolean;
  content_tags: string[];
  pattern_tags: string[];
  constraints: string[];
}

export async function getPromptLeaderboard(): Promise<PromptLeaderboardRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT)) || !(await hasTable(pool, T_PROMPT_METADATA))) return [];

    const { rows: metas } = await pool.query(`SELECT * FROM ${T_PROMPT_METADATA} ORDER BY prompt_id`);
    const { rows: allContexts } = await pool.query(`SELECT * FROM ${T_RESPONSE_CONTEXT}`);

    const results: PromptLeaderboardRow[] = [];

    for (const meta of metas as PromptMetadataWebRow[]) {
      const contexts = (allContexts as ResponseContextWebRow[]).filter(c => c.prompt_id === meta.prompt_id);
      if (contexts.length === 0) continue;

      const constraints = safeJsonParse<string[]>(meta.constraints, []);
      const vendorCounts: Record<string, number> = {};
      let totalConstraintsCovered = 0;
      let implementedCount = 0;
      const vendorSet = new Set<string>();

      for (const ctx of contexts) {
        if (ctx.primary_vendor) {
          vendorCounts[ctx.primary_vendor] = (vendorCounts[ctx.primary_vendor] || 0) + 1;
        }
        const vendors = safeJsonParse<Array<{ vendor: string }>>(ctx.vendors_mentioned, []);
        for (const v of vendors) vendorSet.add(v.vendor);
        if (ctx.primary_vendor) vendorSet.add(ctx.primary_vendor);

        const addressed = safeJsonParse<string[]>(ctx.constraints_addressed, []);
        totalConstraintsCovered += addressed.length;
        if (ctx.is_implemented) implementedCount++;
      }

      const topEntry = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1])[0];
      const topVendorPct = topEntry ? topEntry[1] / contexts.length : 0;

      results.push({
        prompt_id: meta.prompt_id,
        category: meta.category,
        response_count: contexts.length,
        top_vendor: topEntry?.[0] ?? null,
        top_vendor_count: topEntry?.[1] ?? 0,
        unique_vendors: vendorSet.size,
        implementation_rate: contexts.length > 0 ? implementedCount / contexts.length : 0,
        avg_constraints_covered: contexts.length > 0 && constraints.length > 0
          ? totalConstraintsCovered / contexts.length / constraints.length
          : 0,
        total_constraints: constraints.length,
        is_contested: topVendorPct <= 0.5 && contexts.length >= 2,
        is_dominated: topVendorPct === 1 && contexts.length >= 2,
        content_tags: safeJsonParse<string[]>(meta.content_tags, []),
        pattern_tags: safeJsonParse<string[]>(meta.pattern_tags, []),
        constraints,
      });
    }

    return results.sort((a, b) => b.response_count - a.response_count);
  } catch { return []; }
}

export interface ConstraintDemandRow {
  constraint: string;
  prompt_count: number;
  response_count: number;
  coverage_rate: number;
  top_vendor: string | null;
  top_vendor_count: number;
}

export async function getConstraintDemand(): Promise<ConstraintDemandRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT)) || !(await hasTable(pool, T_PROMPT_METADATA))) return [];

    const { rows: metas } = await pool.query(`SELECT * FROM ${T_PROMPT_METADATA}`);
    const { rows: allContexts } = await pool.query(`SELECT * FROM ${T_RESPONSE_CONTEXT}`);

    const constraintMap = new Map<string, {
      promptIds: Set<string>;
      totalResponses: number;
      addressedCount: number;
      vendorAddressed: Map<string, number>;
    }>();

    for (const meta of metas as PromptMetadataWebRow[]) {
      const constraints = safeJsonParse<string[]>(meta.constraints, []);
      const contexts = (allContexts as ResponseContextWebRow[]).filter(c => c.prompt_id === meta.prompt_id);

      for (const c of constraints) {
        if (!constraintMap.has(c)) {
          constraintMap.set(c, { promptIds: new Set(), totalResponses: 0, addressedCount: 0, vendorAddressed: new Map() });
        }
        const entry = constraintMap.get(c)!;
        entry.promptIds.add(meta.prompt_id);
        entry.totalResponses += contexts.length;
      }
    }

    for (const ctx of allContexts as ResponseContextWebRow[]) {
      const addressed = safeJsonParse<string[]>(ctx.constraints_addressed, []);
      for (const c of addressed) {
        const entry = constraintMap.get(c);
        if (entry) {
          entry.addressedCount++;
          if (ctx.primary_vendor) {
            entry.vendorAddressed.set(ctx.primary_vendor, (entry.vendorAddressed.get(ctx.primary_vendor) || 0) + 1);
          }
        }
      }
    }

    return Array.from(constraintMap.entries())
      .map(([constraint, data]) => {
        const topVendor = Array.from(data.vendorAddressed.entries()).sort((a, b) => b[1] - a[1])[0];
        return {
          constraint,
          prompt_count: data.promptIds.size,
          response_count: data.totalResponses,
          coverage_rate: data.totalResponses > 0 ? data.addressedCount / data.totalResponses : 0,
          top_vendor: topVendor?.[0] ?? null,
          top_vendor_count: topVendor?.[1] ?? 0,
        };
      })
      .sort((a, b) => b.prompt_count - a.prompt_count);
  } catch { return []; }
}

export async function getPromptPageData(): Promise<{
  leaderboard: PromptLeaderboardRow[];
  constraintDemand: ConstraintDemandRow[];
}> {
  const pool = getPool();
  if (!pool) return { leaderboard: [], constraintDemand: [] };
  try {
    if (!(await hasTable(pool, T_RESPONSE_CONTEXT)) || !(await hasTable(pool, T_PROMPT_METADATA))) {
      return { leaderboard: [], constraintDemand: [] };
    }

    const [{ rows: metas }, { rows: allContexts }] = await Promise.all([
      pool.query(`SELECT * FROM ${T_PROMPT_METADATA} ORDER BY prompt_id`),
      pool.query(`SELECT * FROM ${T_RESPONSE_CONTEXT}`),
    ]);

    // Index contexts by prompt_id for O(1) lookup instead of O(N) filter
    const contextsByPrompt = new Map<string, ResponseContextWebRow[]>();
    for (const ctx of allContexts as ResponseContextWebRow[]) {
      if (!contextsByPrompt.has(ctx.prompt_id)) contextsByPrompt.set(ctx.prompt_id, []);
      contextsByPrompt.get(ctx.prompt_id)!.push(ctx);
    }

    // === Compute leaderboard ===
    const leaderboard: PromptLeaderboardRow[] = [];
    for (const meta of metas as PromptMetadataWebRow[]) {
      const contexts = contextsByPrompt.get(meta.prompt_id) ?? [];
      if (contexts.length === 0) continue;

      const constraints = safeJsonParse<string[]>(meta.constraints, []);
      const vendorCounts: Record<string, number> = {};
      let totalConstraintsCovered = 0;
      let implementedCount = 0;
      const vendorSet = new Set<string>();

      for (const ctx of contexts) {
        if (ctx.primary_vendor) {
          vendorCounts[ctx.primary_vendor] = (vendorCounts[ctx.primary_vendor] || 0) + 1;
        }
        const vendors = safeJsonParse<Array<{ vendor: string }>>(ctx.vendors_mentioned, []);
        for (const v of vendors) vendorSet.add(v.vendor);
        if (ctx.primary_vendor) vendorSet.add(ctx.primary_vendor);

        const addressed = safeJsonParse<string[]>(ctx.constraints_addressed, []);
        totalConstraintsCovered += addressed.length;
        if (ctx.is_implemented) implementedCount++;
      }

      const topEntry = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1])[0];
      const topVendorPct = topEntry ? topEntry[1] / contexts.length : 0;

      leaderboard.push({
        prompt_id: meta.prompt_id,
        category: meta.category,
        response_count: contexts.length,
        top_vendor: topEntry?.[0] ?? null,
        top_vendor_count: topEntry?.[1] ?? 0,
        unique_vendors: vendorSet.size,
        implementation_rate: contexts.length > 0 ? implementedCount / contexts.length : 0,
        avg_constraints_covered: contexts.length > 0 && constraints.length > 0
          ? totalConstraintsCovered / contexts.length / constraints.length
          : 0,
        total_constraints: constraints.length,
        is_contested: topVendorPct <= 0.5 && contexts.length >= 2,
        is_dominated: topVendorPct === 1 && contexts.length >= 2,
        content_tags: safeJsonParse<string[]>(meta.content_tags, []),
        pattern_tags: safeJsonParse<string[]>(meta.pattern_tags, []),
        constraints,
      });
    }
    leaderboard.sort((a, b) => b.response_count - a.response_count);

    // === Compute constraint demand ===
    const constraintMap = new Map<string, {
      promptIds: Set<string>;
      totalResponses: number;
      addressedCount: number;
      vendorAddressed: Map<string, number>;
    }>();

    for (const meta of metas as PromptMetadataWebRow[]) {
      const constraints = safeJsonParse<string[]>(meta.constraints, []);
      const contexts = contextsByPrompt.get(meta.prompt_id) ?? [];

      for (const c of constraints) {
        if (!constraintMap.has(c)) {
          constraintMap.set(c, { promptIds: new Set(), totalResponses: 0, addressedCount: 0, vendorAddressed: new Map() });
        }
        const entry = constraintMap.get(c)!;
        entry.promptIds.add(meta.prompt_id);
        entry.totalResponses += contexts.length;
      }
    }

    for (const ctx of allContexts as ResponseContextWebRow[]) {
      const addressed = safeJsonParse<string[]>(ctx.constraints_addressed, []);
      for (const c of addressed) {
        const entry = constraintMap.get(c);
        if (entry) {
          entry.addressedCount++;
          if (ctx.primary_vendor) {
            entry.vendorAddressed.set(ctx.primary_vendor, (entry.vendorAddressed.get(ctx.primary_vendor) || 0) + 1);
          }
        }
      }
    }

    const constraintDemand = Array.from(constraintMap.entries())
      .map(([constraint, data]) => {
        const topVendor = Array.from(data.vendorAddressed.entries()).sort((a, b) => b[1] - a[1])[0];
        return {
          constraint,
          prompt_count: data.promptIds.size,
          response_count: data.totalResponses,
          coverage_rate: data.totalResponses > 0 ? data.addressedCount / data.totalResponses : 0,
          top_vendor: topVendor?.[0] ?? null,
          top_vendor_count: topVendor?.[1] ?? 0,
        };
      })
      .sort((a, b) => b.prompt_count - a.prompt_count);

    return { leaderboard, constraintDemand };
  } catch { return { leaderboard: [], constraintDemand: [] }; }
}

// ── Developer Intent Analytics ──────────────────────────────────────

export interface IntentDistributionRow {
  intent: string;
  count: number;
  pct: number;
  avg_confidence: number;
  top_vendor: string | null;
  top_vendor_count: number;
}

export interface IntentVendorRow {
  intent: string;
  vendor: string;
  wins: number;
  total: number;
  win_rate: number;
}

export async function getIntentDistribution(): Promise<IntentDistributionRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "prompt_intents"))) return [];

    const { rows } = await pool.query(`
      SELECT
        pi.intent,
        COUNT(*) AS count,
        AVG(pi.confidence) AS avg_confidence
      FROM prompt_intents pi
      WHERE pi.intent != 'unknown'
      GROUP BY pi.intent
      ORDER BY count DESC
    `);

    const total = (rows as Array<{ count: string }>).reduce((s, r) => s + Number(r.count), 0);

    const results: IntentDistributionRow[] = [];
    for (const row of rows as Array<{ intent: string; count: string; avg_confidence: number }>) {
      let topVendor: string | null = null;
      let topVendorCount = 0;
      try {
        const vendorResult = await pool.query(`
          SELECT rc.primary_vendor, COUNT(*) AS cnt
          FROM prompt_intents pi
          JOIN ${T_RESPONSE_CONTEXT} rc ON pi.session_id = rc.session_id AND pi.prompt_id = rc.prompt_id
          WHERE pi.intent = $1 AND rc.primary_vendor IS NOT NULL
          GROUP BY rc.primary_vendor
          ORDER BY cnt DESC
          LIMIT 1
        `, [row.intent]);
        if (vendorResult.rows[0]) {
          topVendor = (vendorResult.rows[0] as { primary_vendor: string }).primary_vendor;
          topVendorCount = Number((vendorResult.rows[0] as { cnt: string }).cnt);
        }
      } catch { /* join may fail if tables misaligned */ }

      results.push({
        intent: row.intent,
        count: Number(row.count),
        pct: total > 0 ? Number(row.count) / total : 0,
        avg_confidence: row.avg_confidence,
        top_vendor: topVendor,
        top_vendor_count: topVendorCount,
      });
    }

    return results;
  } catch { return []; }
}

export async function getIntentVendorMatrix(): Promise<IntentVendorRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "prompt_intents")) || !(await hasTable(pool, T_RESPONSE_CONTEXT))) return [];

    const { rows } = await pool.query(`
      SELECT
        pi.intent,
        rc.primary_vendor AS vendor,
        COUNT(*) AS wins,
        (SELECT COUNT(*) FROM prompt_intents pi2
         JOIN ${T_RESPONSE_CONTEXT} rc2 ON pi2.session_id = rc2.session_id AND pi2.prompt_id = rc2.prompt_id
         WHERE pi2.intent = pi.intent AND rc2.primary_vendor IS NOT NULL) AS total
      FROM prompt_intents pi
      JOIN ${T_RESPONSE_CONTEXT} rc ON pi.session_id = rc.session_id AND pi.prompt_id = rc.prompt_id
      WHERE pi.intent != 'unknown' AND rc.primary_vendor IS NOT NULL
      GROUP BY pi.intent, rc.primary_vendor
      ORDER BY pi.intent, wins DESC
    `);

    return (rows as Array<{ intent: string; vendor: string; wins: string; total: string }>).map((r) => ({
      intent: r.intent,
      vendor: r.vendor,
      wins: Number(r.wins),
      total: Number(r.total),
      win_rate: Number(r.total) > 0 ? Number(r.wins) / Number(r.total) : 0,
    }));
  } catch { return []; }
}

// ── FTS Search ──────────────────────────────────────────────────────

export interface SearchResult {
  source_type: string;
  source_id: string;
  vendor: string;
  category: string;
  platform: string;
  prompt_id: string;
  snippet: string;
  rank: number;
}

export async function searchCorpus(
  query: string,
  filters?: { vendor?: string; category?: string; platform?: string; sourceType?: string },
  limit = 20,
  vendorScope?: string | null,
): Promise<SearchResult[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "search_index"))) return [];

    let whereClause = "tsv @@ plainto_tsquery('english', $1)";
    const params: (string | number)[] = [query];
    let paramIdx = 2;

    if (vendorScope) {
      whereClause += ` AND vendor = $${paramIdx++}`;
      params.push(vendorScope);
    }
    if (filters?.vendor) {
      whereClause += ` AND vendor = $${paramIdx++}`;
      params.push(filters.vendor);
    }
    if (filters?.category) {
      whereClause += ` AND category = $${paramIdx++}`;
      params.push(filters.category);
    }
    if (filters?.platform) {
      whereClause += ` AND platform = $${paramIdx++}`;
      params.push(filters.platform);
    }
    if (filters?.sourceType) {
      whereClause += ` AND source_type = $${paramIdx++}`;
      params.push(filters.sourceType);
    }

    params.push(limit);

    const { rows } = await pool.query(`
      SELECT source_type, source_id, vendor, category, platform, prompt_id,
             ts_headline('english', text_content, plainto_tsquery('english', $1),
               'StartSel=<mark>, StopSel=</mark>, MaxFragments=1') AS snippet,
             ts_rank(tsv, plainto_tsquery('english', $1)) AS rank
      FROM search_index
      WHERE ${whereClause}
      ORDER BY rank DESC
      LIMIT $${paramIdx}
    `, params);
    return rows as SearchResult[];
  } catch { return []; }
}

// ── Cross-Session Insights ──────────────────────────────────────────

export interface DivergenceInsight {
  promptId: string;
  platforms: Record<string, string | null>;
  isDivergent: boolean;
  divergenceScore: number;
}

export interface ConstraintInfluenceInsight {
  constraint: string;
  influenceScore: number;
  vendorShifts: Array<{
    vendor: string;
    winRateWith: number;
    winRateWithout: number;
    delta: number;
  }>;
}

export interface DriftInsight {
  vendor: string;
  earlyWinRate: number;
  lateWinRate: number;
  delta: number;
  isSignificant: boolean;
}

export async function getDivergenceMatrix(): Promise<DivergenceInsight[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "cross_session_insights"))) return [];
    const { rows } = await pool.query(
      "SELECT insight_data FROM cross_session_insights WHERE insight_type = 'divergence' ORDER BY generated_at DESC"
    );
    return (rows as Array<{ insight_data: string }>).map((r) => safeJsonParse<DivergenceInsight>(r.insight_data, { promptId: "", platforms: {}, isDivergent: false, divergenceScore: 0 }));
  } catch { return []; }
}

export async function getConstraintInfluence(): Promise<ConstraintInfluenceInsight[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "cross_session_insights"))) return [];
    const { rows } = await pool.query(
      "SELECT insight_data FROM cross_session_insights WHERE insight_type = 'constraint_influence' ORDER BY generated_at DESC"
    );
    return (rows as Array<{ insight_data: string }>).map((r) => safeJsonParse<ConstraintInfluenceInsight>(r.insight_data, { constraint: "", influenceScore: 0, vendorShifts: [] }));
  } catch { return []; }
}

export async function getTemporalDrift(): Promise<DriftInsight[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "cross_session_insights"))) return [];
    const { rows } = await pool.query(
      "SELECT insight_data FROM cross_session_insights WHERE insight_type = 'temporal_drift' ORDER BY generated_at DESC"
    );
    return (rows as Array<{ insight_data: string }>).map((r) => safeJsonParse<DriftInsight>(r.insight_data, { vendor: "", earlyWinRate: 0, lateWinRate: 0, delta: 0, isSignificant: false }));
  } catch { return []; }
}

// ── Daily Digest ────────────────────────────────────────────────────

export interface DigestRow {
  run_date: string;
  summary: string | null;
  significant_changes: unknown[];
  alerts: Array<{
    alertType: string;
    vendor: string;
    severity: string;
    message: string;
  }>;
}

export async function getLatestDigests(limit = 5): Promise<DigestRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "daily_digests"))) return [];
    const { rows } = await pool.query(
      "SELECT * FROM daily_digests ORDER BY run_date DESC LIMIT $1",
      [limit],
    );
    return (rows as Array<{
      run_date: string;
      summary: string | null;
      significant_changes: string;
      alerts: string;
    }>).map((r) => ({
      run_date: r.run_date,
      summary: r.summary,
      significant_changes: safeJsonParse<unknown[]>(r.significant_changes, []),
      alerts: safeJsonParse<DigestRow["alerts"]>(r.alerts, []),
    }));
  } catch { return []; }
}

function getConstraintCoverageForCategory(
  category: string,
  metas: PromptMetadataWebRow[],
  responses: ResponseContextWebRow[],
): ConstraintCoverageRow[] {
  const constraintTotals = new Map<string, number>();
  const constraintAddressed = new Map<string, number>();

  for (const meta of metas) {
    const constraints = safeJsonParse<string[]>(meta.constraints, []);
    const responseCount = responses.filter(r => r.prompt_id === meta.prompt_id).length;
    for (const c of constraints) {
      constraintTotals.set(c, (constraintTotals.get(c) || 0) + responseCount);
    }
  }

  for (const r of responses) {
    const addressed = safeJsonParse<string[]>(r.constraints_addressed, []);
    for (const c of addressed) {
      constraintAddressed.set(c, (constraintAddressed.get(c) || 0) + 1);
    }
  }

  const result: ConstraintCoverageRow[] = [];
  for (const [constraint, total] of constraintTotals.entries()) {
    const addressed = constraintAddressed.get(constraint) || 0;
    result.push({
      constraint,
      addressed_count: addressed,
      total_count: total,
      coverage_pct: total > 0 ? addressed / total : 0,
    });
  }

  return result.sort((a, b) => b.coverage_pct - a.coverage_pct);
}

// ── Co-mentions (competitive landscape) ────────────────────────────

export interface CoMentionRow {
  co_vendor: string;
  session_count: number;
}

export async function getVendorCoMentions(vendor: string): Promise<CoMentionRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_OBSERVATIONS))) return [];
    const { rows } = await pool.query(`
      SELECT v2.vendor_canonical_id AS co_vendor, COUNT(DISTINCT v1.session_id) AS session_count
      FROM ${T_OBSERVATIONS} v1
      JOIN ${T_OBSERVATIONS} v2
        ON v1.session_id = v2.session_id
        AND v2.vendor_canonical_id != $1
      WHERE v1.vendor_canonical_id = $1
      GROUP BY v2.vendor_canonical_id
      ORDER BY session_count DESC
      LIMIT 20
    `, [vendor]);
    return rows.map((r: Record<string, unknown>) => ({
      co_vendor: r.co_vendor as string,
      session_count: Number(r.session_count),
    }));
  } catch { return []; }
}

// ── Category competitor density ────────────────────────────────────

export interface CategoryDensityRow {
  work_category: string;
  vendor_count: number;
}

export async function getCategoryCompetitorDensity(): Promise<CategoryDensityRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, T_OBSERVATIONS))) return [];
    const { rows } = await pool.query(`
      SELECT work_category, COUNT(DISTINCT vendor_canonical_id) AS vendor_count
      FROM ${T_OBSERVATIONS}
      WHERE work_category IS NOT NULL
      GROUP BY work_category
      ORDER BY vendor_count DESC
    `);
    return rows.map((r: Record<string, unknown>) => ({
      work_category: r.work_category as string,
      vendor_count: Number(r.vendor_count),
    }));
  } catch { return []; }
}

// ── Vendor Rejections ─────────────────────────────────────────────────

export interface RejectionSummaryRow {
  vendor_canonical_id: string;
  total_rejections: number;
  too_expensive: number;
  too_complex: number;
  poor_docs: number;
  not_available_region: number;
  feature_gap: number;
  trust_concerns: number;
  vendor_lock_in: number;
  top_alternative: string | null;
  total_mentions: number;
  rejection_rate: number;
}

export async function getRejectionSummary(vendorScope?: string | null): Promise<RejectionSummaryRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "vendor_rejections"))) return [];
    const params: string[] = [];
    let vendorWhere = "";
    if (vendorScope) {
      vendorWhere = "WHERE vr.vendor_canonical_id = $1";
      params.push(vendorScope);
    }
    const { rows } = await pool.query(`
      SELECT
        vr.vendor_canonical_id,
        COUNT(*) AS total_rejections,
        SUM(CASE WHEN vr.rejection_reason = 'too_expensive' THEN 1 ELSE 0 END) AS too_expensive,
        SUM(CASE WHEN vr.rejection_reason = 'too_complex' THEN 1 ELSE 0 END) AS too_complex,
        SUM(CASE WHEN vr.rejection_reason = 'poor_docs' THEN 1 ELSE 0 END) AS poor_docs,
        SUM(CASE WHEN vr.rejection_reason = 'not_available_region' THEN 1 ELSE 0 END) AS not_available_region,
        SUM(CASE WHEN vr.rejection_reason = 'feature_gap' THEN 1 ELSE 0 END) AS feature_gap,
        SUM(CASE WHEN vr.rejection_reason = 'trust_concerns' THEN 1 ELSE 0 END) AS trust_concerns,
        SUM(CASE WHEN vr.rejection_reason = 'vendor_lock_in' THEN 1 ELSE 0 END) AS vendor_lock_in,
        (SELECT vr2.chosen_alternative FROM vendor_rejections vr2
         WHERE vr2.vendor_canonical_id = vr.vendor_canonical_id AND vr2.chosen_alternative IS NOT NULL
         GROUP BY vr2.chosen_alternative ORDER BY COUNT(*) DESC LIMIT 1) AS top_alternative,
        COALESCE((SELECT COUNT(*) FROM ${T_OBSERVATIONS} o WHERE o.vendor_canonical_id = vr.vendor_canonical_id), 0) AS total_mentions
      FROM vendor_rejections vr
      ${vendorWhere}
      GROUP BY vr.vendor_canonical_id
      ORDER BY total_rejections DESC
    `, params);
    return rows.map((r: Record<string, unknown>) => {
      const totalRejections = Number(r.total_rejections);
      const totalMentions = Number(r.total_mentions);
      return {
        vendor_canonical_id: r.vendor_canonical_id as string,
        total_rejections: totalRejections,
        too_expensive: Number(r.too_expensive),
        too_complex: Number(r.too_complex),
        poor_docs: Number(r.poor_docs),
        not_available_region: Number(r.not_available_region),
        feature_gap: Number(r.feature_gap),
        trust_concerns: Number(r.trust_concerns),
        vendor_lock_in: Number(r.vendor_lock_in),
        top_alternative: (r.top_alternative as string) || null,
        total_mentions: totalMentions,
        rejection_rate: totalMentions > 0 ? totalRejections / totalMentions : 0,
      };
    });
  } catch { return []; }
}

export interface RejectionDetailRow {
  id: number;
  session_id: string;
  vendor_canonical_id: string;
  rejection_reason: string;
  rejection_reason_detail: string | null;
  chosen_alternative: string | null;
  timestamp: string;
  source_platform: string | null;
}

export async function getRejectionDetails(vendorId?: string, limit = 100): Promise<RejectionDetailRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "vendor_rejections"))) return [];
    const params: (string | number)[] = [];
    let where = "";
    let paramIdx = 1;
    if (vendorId) {
      where = `WHERE vr.vendor_canonical_id = $${paramIdx++}`;
      params.push(vendorId);
    }
    params.push(limit);
    const { rows } = await pool.query(`
      SELECT vr.*, s.source_platform
      FROM vendor_rejections vr
      LEFT JOIN ${T_SESSIONS} s ON vr.session_id = s.id
      ${where}
      ORDER BY vr.timestamp DESC
      LIMIT $${paramIdx}
    `, params);
    return rows.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      session_id: r.session_id as string,
      vendor_canonical_id: r.vendor_canonical_id as string,
      rejection_reason: r.rejection_reason as string,
      rejection_reason_detail: (r.rejection_reason_detail as string) || null,
      chosen_alternative: (r.chosen_alternative as string) || null,
      timestamp: r.timestamp as string,
      source_platform: (r.source_platform as string) || null,
    }));
  } catch { return []; }
}

export interface RejectionReasonBreakdown {
  reason: string;
  count: number;
  percentage: number;
}

export async function getRejectionReasonBreakdown(vendorId?: string): Promise<RejectionReasonBreakdown[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "vendor_rejections"))) return [];
    const params: string[] = [];
    let where = "";
    if (vendorId) {
      where = "WHERE vendor_canonical_id = $1";
      params.push(vendorId);
    }
    const { rows } = await pool.query(`
      SELECT rejection_reason, COUNT(*) AS count
      FROM vendor_rejections
      ${where}
      GROUP BY rejection_reason
      ORDER BY count DESC
    `, params);
    const total = rows.reduce((acc: number, r: Record<string, unknown>) => acc + Number(r.count), 0);
    return rows.map((r: Record<string, unknown>) => ({
      reason: r.rejection_reason as string,
      count: Number(r.count),
      percentage: total > 0 ? Number(r.count) / total : 0,
    }));
  } catch { return []; }
}

export interface AlternativeFlowRow {
  rejected_vendor: string;
  chosen_alternative: string;
  count: number;
}

export async function getAlternativeFlows(vendorScope?: string | null): Promise<AlternativeFlowRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "vendor_rejections"))) return [];
    const params: string[] = [];
    let where = "WHERE chosen_alternative IS NOT NULL";
    if (vendorScope) {
      where += " AND (vendor_canonical_id = $1 OR chosen_alternative = $1)";
      params.push(vendorScope);
    }
    const { rows } = await pool.query(`
      SELECT vendor_canonical_id AS rejected_vendor, chosen_alternative, COUNT(*) AS count
      FROM vendor_rejections
      ${where}
      GROUP BY vendor_canonical_id, chosen_alternative
      ORDER BY count DESC
      LIMIT 50
    `, params);
    return rows.map((r: Record<string, unknown>) => ({
      rejected_vendor: r.rejected_vendor as string,
      chosen_alternative: r.chosen_alternative as string,
      count: Number(r.count),
    }));
  } catch { return []; }
}

// ── Build vs Buy (Custom/DIY Rates) ────────────────────────────────

export interface BuildVsBuyRow {
  category: string;
  platform: string;
  total_responses: number;
  custom_diy_count: number;
  diy_rate: number;
}

export interface BuildVsBuyCategoryRow {
  category: string;
  platforms: Record<string, { total: number; diyCount: number; diyRate: number }>;
  delta: number;
}

export async function getBuildVsBuyRates(): Promise<BuildVsBuyCategoryRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "response_context"))) return [];
    const { rows } = await pool.query(`
      SELECT
        COALESCE(pm.category, 'other') AS category,
        s.source_platform AS platform,
        COUNT(*)::int AS total_responses,
        COUNT(*) FILTER (WHERE rc.is_custom_diy = true)::int AS custom_diy_count,
        ROUND(COUNT(*) FILTER (WHERE rc.is_custom_diy = true) * 100.0 / NULLIF(COUNT(*), 0), 1) AS diy_rate
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
      WHERE s.is_benchmark = true
      GROUP BY COALESCE(pm.category, 'other'), s.source_platform
      HAVING COUNT(*) >= 2
      ORDER BY category, platform
    `);

    const byCategory = new Map<string, Record<string, { total: number; diyCount: number; diyRate: number }>>();
    for (const r of rows as BuildVsBuyRow[]) {
      if (!byCategory.has(r.category)) byCategory.set(r.category, {});
      byCategory.get(r.category)![r.platform] = {
        total: Number(r.total_responses),
        diyCount: Number(r.custom_diy_count),
        diyRate: Number(r.diy_rate),
      };
    }

    const result: BuildVsBuyCategoryRow[] = [];
    for (const [category, platforms] of byCategory) {
      const rates = Object.values(platforms).map((p) => p.diyRate);
      const delta = rates.length >= 2
        ? Math.max(...rates) - Math.min(...rates)
        : 0;
      result.push({ category, platforms, delta });
    }

    result.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return result;
  } catch { return []; }
}

export async function getBuildVsBuyOverall(): Promise<Record<string, { total: number; diyCount: number; diyRate: number }>> {
  const pool = getPool();
  if (!pool) return {};
  try {
    if (!(await hasTable(pool, "response_context"))) return {};
    const { rows } = await pool.query(`
      SELECT
        s.source_platform AS platform,
        COUNT(*)::int AS total_responses,
        COUNT(*) FILTER (WHERE rc.is_custom_diy = true)::int AS custom_diy_count,
        ROUND(COUNT(*) FILTER (WHERE rc.is_custom_diy = true) * 100.0 / NULLIF(COUNT(*), 0), 1) AS diy_rate
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      WHERE s.is_benchmark = true
      GROUP BY s.source_platform
    `);
    const result: Record<string, { total: number; diyCount: number; diyRate: number }> = {};
    for (const r of rows as BuildVsBuyRow[]) {
      result[r.platform] = {
        total: Number(r.total_responses),
        diyCount: Number(r.custom_diy_count),
        diyRate: Number(r.diy_rate),
      };
    }
    return result;
  } catch { return {}; }
}

// ── Agent Splits & Consensus Signals ────────────────────────────────

export interface AgentSplitRow {
  category: string;
  prompt_id: string;
  platforms: Record<string, string>;
  is_consensus: boolean;
}

export async function getAgentSplits(): Promise<AgentSplitRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "response_context"))) return [];
    const { rows } = await pool.query(`
      SELECT
        COALESCE(pm.category, 'other') AS category,
        rc.prompt_id,
        s.source_platform AS platform,
        rc.primary_vendor
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
      WHERE s.is_benchmark = true AND rc.primary_vendor IS NOT NULL
      ORDER BY rc.prompt_id, s.source_platform
    `);

    const byPrompt = new Map<string, { category: string; platforms: Record<string, string> }>();
    for (const r of rows as Array<{ category: string; prompt_id: string; platform: string; primary_vendor: string }>) {
      if (!byPrompt.has(r.prompt_id)) {
        byPrompt.set(r.prompt_id, { category: r.category, platforms: {} });
      }
      byPrompt.get(r.prompt_id)!.platforms[r.platform] = r.primary_vendor;
    }

    const result: AgentSplitRow[] = [];
    for (const [prompt_id, data] of byPrompt) {
      const vendors = Object.values(data.platforms);
      if (vendors.length < 2) continue;
      const uniqueVendors = new Set(vendors);
      result.push({
        category: data.category,
        prompt_id,
        platforms: data.platforms,
        is_consensus: uniqueVendors.size === 1,
      });
    }
    return result;
  } catch { return []; }
}

// ── Side-by-Side Responses (grouped by prompt) ──────────────────────

export interface SideBySideResponse {
  prompt_id: string;
  category: string;
  platform: string;
  model_id: string | null;
  primary_vendor: string | null;
  is_custom_diy: boolean;
  rationale_snippet: string | null;
  reasoning_chain: string | null;
  trade_offs_snippet: string | null;
  constraints_addressed: string[];
}

export async function getSideBySideResponses(category: string): Promise<Map<string, SideBySideResponse[]>> {
  const pool = getPool();
  if (!pool) return new Map();
  try {
    if (!(await hasTable(pool, "response_context"))) return new Map();
    const { rows } = await pool.query(`
      SELECT
        rc.prompt_id,
        COALESCE(pm.category, 'other') AS category,
        s.source_platform AS platform,
        s.model_id,
        rc.primary_vendor,
        COALESCE(rc.is_custom_diy, false) AS is_custom_diy,
        rc.rationale_snippet,
        rc.reasoning_chain,
        rc.trade_offs_snippet,
        rc.constraints_addressed
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
      WHERE s.is_benchmark = true AND COALESCE(pm.category, 'other') = $1
      ORDER BY rc.prompt_id, s.source_platform
    `, [category]);

    const grouped = new Map<string, SideBySideResponse[]>();
    for (const r of rows as Array<Record<string, unknown>>) {
      const promptId = r.prompt_id as string;
      if (!grouped.has(promptId)) grouped.set(promptId, []);
      grouped.get(promptId)!.push({
        prompt_id: promptId,
        category: r.category as string,
        platform: r.platform as string,
        model_id: r.model_id as string | null,
        primary_vendor: r.primary_vendor as string | null,
        is_custom_diy: r.is_custom_diy as boolean,
        rationale_snippet: r.rationale_snippet as string | null,
        reasoning_chain: r.reasoning_chain as string | null,
        trade_offs_snippet: r.trade_offs_snippet as string | null,
        constraints_addressed: safeJsonParse<string[]>(r.constraints_addressed as string, []),
      });
    }
    return grouped;
  } catch { return new Map(); }
}
