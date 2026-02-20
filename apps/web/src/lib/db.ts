import { Pool } from "pg";

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

export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

// ── Dashboard Stats ─────────────────────────────────────────────────

export async function getDashboardStats() {
  const pool = getPool();
  if (!pool) return { totalSessions: 0, totalObservations: 0, uniqueVendors: 0, platformBreakdown: {} as Record<string, number>, lastIngestedAt: null as string | null };
  try {
    const sessions = (await pool.query("SELECT COUNT(*) AS c FROM sessions")).rows[0] as { c: string };
    const observations = (await pool.query("SELECT COUNT(*) AS c FROM observations")).rows[0] as { c: string };
    const vendors = (await pool.query("SELECT COUNT(DISTINCT vendor_canonical_id) AS c FROM observations")).rows[0] as { c: string };
    const { rows: platforms } = await pool.query("SELECT source_platform, COUNT(*) AS c FROM sessions GROUP BY source_platform");
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

export async function getVendorStats(platformFilter?: string, categoryFilter?: string): Promise<VendorStatsRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    let where = "WHERE 1=1";
    const params: string[] = [];
    let paramIdx = 1;
    if (platformFilter) {
      where += ` AND o.session_id IN (SELECT id FROM sessions WHERE source_platform = $${paramIdx++})`;
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
      FROM observations o
      JOIN sessions s ON o.session_id = s.id
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

export async function getPlatformComparison(): Promise<PlatformCompRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`
      SELECT
        o.vendor_canonical_id,
        SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) AS claude_code_count,
        SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END) AS codex_cli_count
      FROM observations o
      JOIN sessions s ON o.session_id = s.id
      GROUP BY o.vendor_canonical_id
      HAVING SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) > 0
         OR SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END) > 0
      ORDER BY (SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) + SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END)) DESC
    `);
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

export async function getActionFunnel(): Promise<FunnelRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`
      SELECT
        vendor_canonical_id,
        SUM(CASE WHEN mention_type IN ('mentioned', 'compared', 'recommended', 'installed', 'configured', 'implemented') THEN 1 ELSE 0 END) AS mentioned_total,
        SUM(CASE WHEN mention_type IN ('recommended') THEN 1 ELSE 0 END) AS recommended_total,
        SUM(CASE WHEN mention_type IN ('installed', 'configured', 'implemented') THEN 1 ELSE 0 END) AS installed_total
      FROM observations
      GROUP BY vendor_canonical_id
      HAVING SUM(CASE WHEN mention_type IN ('mentioned', 'compared', 'recommended', 'installed', 'configured', 'implemented') THEN 1 ELSE 0 END) > 0
      ORDER BY SUM(CASE WHEN mention_type IN ('mentioned', 'compared', 'recommended', 'installed', 'configured', 'implemented') THEN 1 ELSE 0 END) DESC
    `);
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
}

export async function getSessionList(limit = 50, offset = 0): Promise<SessionListRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`
      SELECT
        s.id, s.source_platform, s.model_id, s.started_at, s.cwd, s.turn_count,
        COUNT(o.id) AS observation_count,
        string_agg(DISTINCT o.vendor_canonical_id, ',') AS vendors
      FROM sessions s
      LEFT JOIN observations o ON s.id = o.session_id
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
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

export interface SessionDetail {
  session: { id: string; source_platform: string; model_id: string | null; started_at: string; ended_at: string | null; cwd: string | null; git_branch: string | null; turn_count: number };
  observations: Array<{ vendor_canonical_id: string; vendor_raw: string; mention_type: string; work_category: string | null; confidence: number; context_snippet: string | null; timestamp: string }>;
  toolActions: Array<{ tool_name: string; command_or_path: string | null; vendor_canonical_id: string | null; action_type: string | null; success: number | null; timestamp: string }>;
}

export async function getSessionDetail(id: string): Promise<SessionDetail | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    const sessionResult = await pool.query("SELECT * FROM sessions WHERE id = $1", [id]);
    const session = sessionResult.rows[0] as SessionDetail["session"] | undefined;
    if (!session) return null;
    const obsResult = await pool.query("SELECT vendor_canonical_id, vendor_raw, mention_type, work_category, confidence, context_snippet, timestamp FROM observations WHERE session_id = $1 ORDER BY timestamp", [id]);
    const toolResult = await pool.query("SELECT tool_name, command_or_path, vendor_canonical_id, action_type, success, timestamp FROM tool_actions WHERE session_id = $1 ORDER BY timestamp", [id]);
    return { session, observations: obsResult.rows as SessionDetail["observations"], toolActions: toolResult.rows as SessionDetail["toolActions"] };
  } catch { return null; }
}

// ── Top Vendors (for dashboard) ─────────────────────────────────────

export async function getTopVendors(limit = 10): Promise<Array<{ vendor_canonical_id: string; count: number }>> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`
      SELECT vendor_canonical_id, COUNT(*) AS count
      FROM observations
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
    const { rows } = await pool.query("SELECT DISTINCT work_category FROM observations WHERE work_category IS NOT NULL ORDER BY work_category");
    return rows.map((r: { work_category: string }) => r.work_category);
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

export async function getBenchmarkSessions(limit = 100): Promise<BenchmarkRunRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.source_platform, s.model_id, s.started_at, s.cwd, s.turn_count,
        COUNT(o.id) AS observation_count,
        string_agg(DISTINCT o.vendor_canonical_id, ',') AS vendors
      FROM sessions s LEFT JOIN observations o ON s.id = o.session_id
      WHERE s.is_benchmark = TRUE
      GROUP BY s.id ORDER BY s.started_at DESC LIMIT $1
    `, [limit]);
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

export async function getBenchmarkVendorComparison(): Promise<BenchmarkVendorCompRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`
      SELECT o.vendor_canonical_id,
        SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) AS claude_code_count,
        SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END) AS codex_cli_count,
        SUM(CASE WHEN s.source_platform = 'cursor' THEN 1 ELSE 0 END) AS cursor_count,
        COUNT(*) AS total
      FROM observations o JOIN sessions s ON o.session_id = s.id
      WHERE s.is_benchmark = TRUE
      GROUP BY o.vendor_canonical_id ORDER BY total DESC
    `);
    return rows.map((r: Record<string, unknown>) => ({
      vendor_canonical_id: r.vendor_canonical_id as string,
      claude_code_count: Number(r.claude_code_count),
      codex_cli_count: Number(r.codex_cli_count),
      cursor_count: Number(r.cursor_count),
      total: Number(r.total),
    }));
  } catch { return []; }
}

export async function getBenchmarkStats() {
  const pool = getPool();
  if (!pool) return { totalBenchmarkSessions: 0, totalBenchmarkObservations: 0, platformBreakdown: {} as Record<string, number> };
  try {
    const sessions = (await pool.query("SELECT COUNT(*) AS c FROM sessions WHERE is_benchmark = TRUE")).rows[0] as { c: string };
    const observations = (await pool.query("SELECT COUNT(*) AS c FROM observations WHERE session_id IN (SELECT id FROM sessions WHERE is_benchmark = TRUE)")).rows[0] as { c: string };
    const { rows: platforms } = await pool.query("SELECT source_platform, COUNT(*) AS c FROM sessions WHERE is_benchmark = TRUE GROUP BY source_platform");
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
    if (!(await hasTable(pool, "prompt_metadata"))) return [];
    const { rows } = await pool.query("SELECT * FROM prompt_metadata ORDER BY prompt_id");
    return rows as PromptMetadataWebRow[];
  } catch { return []; }
}

export async function getPromptMetadataById(promptId: string): Promise<PromptMetadataWebRow | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    if (!(await hasTable(pool, "prompt_metadata"))) return null;
    const { rows } = await pool.query("SELECT * FROM prompt_metadata WHERE prompt_id = $1", [promptId]);
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
    if (!(await hasTable(pool, "response_context"))) return [];
    const { rows } = await pool.query(`
      SELECT rc.*, s.source_platform
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
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
    if (!(await hasTable(pool, "response_context"))) return [];
    const { rows } = await pool.query("SELECT * FROM response_context WHERE session_id = $1", [sessionId]);
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
}): Promise<PrimaryVendorCountRow[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return [];
    let where = "rc.primary_vendor IS NOT NULL";
    const params: string[] = [];
    let paramIdx = 1;
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
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
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
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return [];

    let metaQuery = "SELECT prompt_id, constraints FROM prompt_metadata";
    const metaParams: string[] = [];
    if (promptId) {
      metaQuery += " WHERE prompt_id = $1";
      metaParams.push(promptId);
    }
    const { rows: metas } = await pool.query(metaQuery, metaParams);

    let rcQuery = "SELECT prompt_id, constraints_addressed FROM response_context";
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

export async function getPromptEnrichmentSummaries(): Promise<PromptEnrichmentSummary[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return [];

    const { rows: metas } = await pool.query("SELECT * FROM prompt_metadata ORDER BY prompt_id");
    const { rows: allContexts } = await pool.query("SELECT * FROM response_context");

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
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return null;

    const { rows: allResponses } = await pool.query(`
      SELECT rc.*, s.source_platform, pm.category, pm.constraints
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
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
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return [];

    const { rows: allResponses } = await pool.query(`
      SELECT rc.*, s.source_platform, pm.category, pm.constraints
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
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
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return [];

    const { rows: allResponses } = await pool.query(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, rc.is_implemented,
             s.source_platform, pm.category
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
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
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return empty;

    const { rows: allResponses } = await pool.query(`
      SELECT rc.prompt_id, rc.primary_vendor, rc.vendors_mentioned, rc.rationale_snippet,
             pm.category
      FROM response_context rc
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
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
    if (!(await hasTable(pool, "prompt_metadata")) || !(await hasTable(pool, "response_context"))) {
      return { prompts, promptMetadata: [], responses: [], vendorCounts: [], constraintCoverage: [] };
    }

    const promptIds = prompts.map(p => p.prompt_id);
    const placeholders = promptIds.map((_, i) => `$${i + 1}`).join(",");

    const { rows: promptMetadata } = await pool.query(
      `SELECT * FROM prompt_metadata WHERE category = $1 ORDER BY prompt_id`,
      [category],
    );

    const { rows: responses } = await pool.query(
      `SELECT rc.*, s.source_platform
       FROM response_context rc
       JOIN sessions s ON rc.session_id = s.id
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
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return null;

    const { rows: allResponses } = await pool.query(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, rc.extracted_at,
             s.started_at, s.source_platform
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
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
    if (!(await hasTable(pool, "response_context"))) return [];

    const { rows: allResponses } = await pool.query(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, rc.extracted_at,
             s.started_at
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
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
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return [];

    const { rows: metas } = await pool.query("SELECT * FROM prompt_metadata ORDER BY prompt_id");
    const { rows: allContexts } = await pool.query("SELECT * FROM response_context");

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
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) return [];

    const { rows: metas } = await pool.query("SELECT * FROM prompt_metadata");
    const { rows: allContexts } = await pool.query("SELECT * FROM response_context");

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
    if (!(await hasTable(pool, "response_context")) || !(await hasTable(pool, "prompt_metadata"))) {
      return { leaderboard: [], constraintDemand: [] };
    }

    const [{ rows: metas }, { rows: allContexts }] = await Promise.all([
      pool.query("SELECT * FROM prompt_metadata ORDER BY prompt_id"),
      pool.query("SELECT * FROM response_context"),
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
          JOIN response_context rc ON pi.session_id = rc.session_id AND pi.prompt_id = rc.prompt_id
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
    if (!(await hasTable(pool, "prompt_intents")) || !(await hasTable(pool, "response_context"))) return [];

    const { rows } = await pool.query(`
      SELECT
        pi.intent,
        rc.primary_vendor AS vendor,
        COUNT(*) AS wins,
        (SELECT COUNT(*) FROM prompt_intents pi2
         JOIN response_context rc2 ON pi2.session_id = rc2.session_id AND pi2.prompt_id = rc2.prompt_id
         WHERE pi2.intent = pi.intent AND rc2.primary_vendor IS NOT NULL) AS total
      FROM prompt_intents pi
      JOIN response_context rc ON pi.session_id = rc.session_id AND pi.prompt_id = rc.prompt_id
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
): Promise<SearchResult[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    if (!(await hasTable(pool, "search_index"))) return [];

    let whereClause = "tsv @@ plainto_tsquery('english', $1)";
    const params: (string | number)[] = [query];
    let paramIdx = 2;

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
