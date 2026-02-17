import Database from "better-sqlite3";
import path from "path";
import { existsSync, copyFileSync } from "fs";

// ── Lazy DB initialization ──────────────────────────────────────────

let _db: Database.Database | null = null;
let _dbFailed = false;

function findSourceDbPath(): string | null {
  if (process.env.OBS_DB_PATH) return process.env.OBS_DB_PATH;

  const candidates = [
    path.resolve(process.cwd(), "../../db/observatory.sqlite"),
    path.resolve(process.cwd(), "db/observatory.sqlite"),
    path.resolve(__dirname, "../../db/observatory.sqlite"),
    path.resolve(__dirname, "../../../db/observatory.sqlite"),
    path.resolve(__dirname, "../../../../db/observatory.sqlite"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function getDb(): Database.Database | null {
  if (_dbFailed) return null;
  if (_db) return _db;
  try {
    const sourcePath = findSourceDbPath();
    if (!sourcePath) {
      console.error("[vendor-observatory] No DB file found");
      _dbFailed = true;
      return null;
    }

    // On Vercel, the filesystem is readonly — copy DB to /tmp so SQLite can create journal
    let dbPath = sourcePath;
    const tmpPath = "/tmp/observatory.sqlite";
    if (process.env.VERCEL || !existsSync(path.dirname(sourcePath) + "/.writable_check")) {
      if (!existsSync(tmpPath)) {
        copyFileSync(sourcePath, tmpPath);
      }
      dbPath = tmpPath;
    }

    _db = new Database(dbPath, { readonly: true, fileMustExist: true });
    return _db;
  } catch (err) {
    console.error("[vendor-observatory] DB init failed:", err);
    _dbFailed = true;
    return null;
  }
}

// ── Dashboard Stats ─────────────────────────────────────────────────

export function getDashboardStats() {
  const db = getDb();
  if (!db) return { totalSessions: 0, totalObservations: 0, uniqueVendors: 0, platformBreakdown: {} as Record<string, number>, lastIngestedAt: null as string | null };
  try {
    const sessions = (db.prepare("SELECT COUNT(*) AS c FROM sessions").get() as { c: number }).c;
    const observations = (db.prepare("SELECT COUNT(*) AS c FROM observations").get() as { c: number }).c;
    const vendors = (db.prepare("SELECT COUNT(DISTINCT vendor_canonical_id) AS c FROM observations").get() as { c: number }).c;
    const platforms = db.prepare("SELECT source_platform, COUNT(*) AS c FROM sessions GROUP BY source_platform").all() as Array<{ source_platform: string; c: number }>;
    const platformBreakdown: Record<string, number> = {};
    for (const p of platforms) platformBreakdown[p.source_platform] = p.c;
    const lastIngested = db.prepare("SELECT MAX(ingested_at) AS t FROM ingested_files").get() as { t: string | null };
    return { totalSessions: sessions, totalObservations: observations, uniqueVendors: vendors, platformBreakdown, lastIngestedAt: lastIngested?.t ?? null };
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

export function getVendorStats(platformFilter?: string, categoryFilter?: string): VendorStatsRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    let where = "WHERE 1=1";
    const params: string[] = [];
    if (platformFilter) {
      where += " AND o.session_id IN (SELECT id FROM sessions WHERE source_platform = ?)";
      params.push(platformFilter);
    }
    if (categoryFilter) {
      where += " AND o.work_category = ?";
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
        GROUP_CONCAT(DISTINCT s.source_platform) AS platforms,
        o.work_category
      FROM observations o
      JOIN sessions s ON o.session_id = s.id
      ${where}
      GROUP BY o.vendor_canonical_id
      ORDER BY total DESC
    `;
    return db.prepare(sql).all(...params) as VendorStatsRow[];
  } catch { return []; }
}

// ── Platform Comparison ─────────────────────────────────────────────

export interface PlatformCompRow {
  vendor_canonical_id: string;
  claude_code_count: number;
  codex_cli_count: number;
}

export function getPlatformComparison(): PlatformCompRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare(`
      SELECT
        o.vendor_canonical_id,
        SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) AS claude_code_count,
        SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END) AS codex_cli_count
      FROM observations o
      JOIN sessions s ON o.session_id = s.id
      GROUP BY o.vendor_canonical_id
      HAVING claude_code_count > 0 OR codex_cli_count > 0
      ORDER BY (claude_code_count + codex_cli_count) DESC
    `).all() as PlatformCompRow[];
  } catch { return []; }
}

// ── Actions / Funnel ────────────────────────────────────────────────

export interface FunnelRow {
  vendor_canonical_id: string;
  mentioned_total: number;
  recommended_total: number;
  installed_total: number;
}

export function getActionFunnel(): FunnelRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare(`
      SELECT
        vendor_canonical_id,
        SUM(CASE WHEN mention_type IN ('mentioned', 'compared', 'recommended', 'installed', 'configured', 'implemented') THEN 1 ELSE 0 END) AS mentioned_total,
        SUM(CASE WHEN mention_type IN ('recommended') THEN 1 ELSE 0 END) AS recommended_total,
        SUM(CASE WHEN mention_type IN ('installed', 'configured', 'implemented') THEN 1 ELSE 0 END) AS installed_total
      FROM observations
      GROUP BY vendor_canonical_id
      HAVING mentioned_total > 0
      ORDER BY mentioned_total DESC
    `).all() as FunnelRow[];
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

export function getSessionList(limit = 50, offset = 0): SessionListRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare(`
      SELECT
        s.id, s.source_platform, s.model_id, s.started_at, s.cwd, s.turn_count,
        COUNT(o.id) AS observation_count,
        GROUP_CONCAT(DISTINCT o.vendor_canonical_id) AS vendors
      FROM sessions s
      LEFT JOIN observations o ON s.id = o.session_id
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as SessionListRow[];
  } catch { return []; }
}

export interface SessionDetail {
  session: { id: string; source_platform: string; model_id: string | null; started_at: string; ended_at: string | null; cwd: string | null; git_branch: string | null; turn_count: number };
  observations: Array<{ vendor_canonical_id: string; vendor_raw: string; mention_type: string; work_category: string | null; confidence: number; context_snippet: string | null; timestamp: string }>;
  toolActions: Array<{ tool_name: string; command_or_path: string | null; vendor_canonical_id: string | null; action_type: string | null; success: number | null; timestamp: string }>;
}

export function getSessionDetail(id: string): SessionDetail | null {
  const db = getDb();
  if (!db) return null;
  try {
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionDetail["session"] | undefined;
    if (!session) return null;
    const observations = db.prepare("SELECT vendor_canonical_id, vendor_raw, mention_type, work_category, confidence, context_snippet, timestamp FROM observations WHERE session_id = ? ORDER BY timestamp").all(id) as SessionDetail["observations"];
    const toolActions = db.prepare("SELECT tool_name, command_or_path, vendor_canonical_id, action_type, success, timestamp FROM tool_actions WHERE session_id = ? ORDER BY timestamp").all(id) as SessionDetail["toolActions"];
    return { session, observations, toolActions };
  } catch { return null; }
}

// ── Top Vendors (for dashboard) ─────────────────────────────────────

export function getTopVendors(limit = 10): Array<{ vendor_canonical_id: string; count: number }> {
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare(`
      SELECT vendor_canonical_id, COUNT(*) AS count
      FROM observations
      GROUP BY vendor_canonical_id
      ORDER BY count DESC
      LIMIT ?
    `).all(limit) as Array<{ vendor_canonical_id: string; count: number }>;
  } catch { return []; }
}

// ── Categories ──────────────────────────────────────────────────────

export function getCategories(): string[] {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db.prepare("SELECT DISTINCT work_category FROM observations WHERE work_category IS NOT NULL ORDER BY work_category").all() as Array<{ work_category: string }>;
    return rows.map(r => r.work_category);
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

export function getBenchmarkSessions(limit = 100): BenchmarkRunRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    const cols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === "is_benchmark")) return [];
    return db.prepare(`
      SELECT s.id, s.source_platform, s.model_id, s.started_at, s.cwd, s.turn_count,
        COUNT(o.id) AS observation_count,
        GROUP_CONCAT(DISTINCT o.vendor_canonical_id) AS vendors
      FROM sessions s LEFT JOIN observations o ON s.id = o.session_id
      WHERE s.is_benchmark = 1
      GROUP BY s.id ORDER BY s.started_at DESC LIMIT ?
    `).all(limit) as BenchmarkRunRow[];
  } catch { return []; }
}

export interface BenchmarkVendorCompRow {
  vendor_canonical_id: string;
  claude_code_count: number;
  codex_cli_count: number;
  cursor_count: number;
  total: number;
}

export function getBenchmarkVendorComparison(): BenchmarkVendorCompRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    const cols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === "is_benchmark")) return [];
    return db.prepare(`
      SELECT o.vendor_canonical_id,
        SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) AS claude_code_count,
        SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END) AS codex_cli_count,
        SUM(CASE WHEN s.source_platform = 'cursor' THEN 1 ELSE 0 END) AS cursor_count,
        COUNT(*) AS total
      FROM observations o JOIN sessions s ON o.session_id = s.id
      WHERE s.is_benchmark = 1
      GROUP BY o.vendor_canonical_id ORDER BY total DESC
    `).all() as BenchmarkVendorCompRow[];
  } catch { return []; }
}

export function getBenchmarkStats() {
  const db = getDb();
  if (!db) return { totalBenchmarkSessions: 0, totalBenchmarkObservations: 0, platformBreakdown: {} as Record<string, number> };
  try {
    const cols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === "is_benchmark")) return { totalBenchmarkSessions: 0, totalBenchmarkObservations: 0, platformBreakdown: {} };
    const sessions = (db.prepare("SELECT COUNT(*) AS c FROM sessions WHERE is_benchmark = 1").get() as { c: number }).c;
    const observations = (db.prepare("SELECT COUNT(*) AS c FROM observations WHERE session_id IN (SELECT id FROM sessions WHERE is_benchmark = 1)").get() as { c: number }).c;
    const platforms = db.prepare("SELECT source_platform, COUNT(*) AS c FROM sessions WHERE is_benchmark = 1 GROUP BY source_platform").all() as Array<{ source_platform: string; c: number }>;
    const platformBreakdown: Record<string, number> = {};
    for (const p of platforms) platformBreakdown[p.source_platform] = p.c;
    return { totalBenchmarkSessions: sessions, totalBenchmarkObservations: observations, platformBreakdown };
  } catch { return { totalBenchmarkSessions: 0, totalBenchmarkObservations: 0, platformBreakdown: {} }; }
}

// ── Enrichment: Prompt Metadata ────────────────────────────────────

function hasTable(db: import("better-sqlite3").Database, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) as { name: string } | undefined;
  return !!row;
}

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

export function getPromptMetadata(): PromptMetadataWebRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "prompt_metadata")) return [];
    return db.prepare("SELECT * FROM prompt_metadata ORDER BY prompt_id").all() as PromptMetadataWebRow[];
  } catch { return []; }
}

export function getPromptMetadataById(promptId: string): PromptMetadataWebRow | null {
  const db = getDb();
  if (!db) return null;
  try {
    if (!hasTable(db, "prompt_metadata")) return null;
    return (db.prepare("SELECT * FROM prompt_metadata WHERE prompt_id = ?").get(promptId) as PromptMetadataWebRow) || null;
  } catch { return null; }
}

// ── Enrichment: Response Context ───────────────────────────────────

export interface ResponseContextWebRow {
  id: number;
  session_id: string;
  prompt_id: string;
  primary_vendor: string | null;
  is_implemented: number;
  rationale_snippet: string | null;
  vendors_mentioned: string;
  trade_offs_snippet: string | null;
  gotchas_snippet: string | null;
  constraints_addressed: string;
  extracted_at: string;
}

export function getResponseContextByPrompt(promptId: string): ResponseContextWebRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "response_context")) return [];
    return db.prepare(`
      SELECT rc.*, s.source_platform
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      WHERE rc.prompt_id = ?
      ORDER BY rc.extracted_at DESC
    `).all(promptId) as (ResponseContextWebRow & { source_platform: string })[];
  } catch { return []; }
}

export function getResponseContextBySession(sessionId: string): ResponseContextWebRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "response_context")) return [];
    return db.prepare("SELECT * FROM response_context WHERE session_id = ?").all(sessionId) as ResponseContextWebRow[];
  } catch { return []; }
}

// ── Enrichment: Primary Vendor Leaderboard ─────────────────────────

export interface PrimaryVendorCountRow {
  primary_vendor: string;
  count: number;
}

export function getPrimaryVendorCounts(filters?: {
  category?: string;
  platform?: string;
  contentTag?: string;
  patternTag?: string;
}): PrimaryVendorCountRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "response_context") || !hasTable(db, "prompt_metadata")) return [];
    let where = "rc.primary_vendor IS NOT NULL";
    const params: string[] = [];
    if (filters?.category) {
      where += " AND pm.category = ?";
      params.push(filters.category);
    }
    if (filters?.platform) {
      where += " AND s.source_platform = ?";
      params.push(filters.platform);
    }
    if (filters?.contentTag) {
      where += " AND pm.content_tags LIKE ?";
      params.push(`%"${filters.contentTag}"%`);
    }
    if (filters?.patternTag) {
      where += " AND pm.pattern_tags LIKE ?";
      params.push(`%"${filters.patternTag}"%`);
    }
    return db.prepare(`
      SELECT rc.primary_vendor, COUNT(*) AS count
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
      WHERE ${where}
      GROUP BY rc.primary_vendor
      ORDER BY count DESC
    `).all(...params) as PrimaryVendorCountRow[];
  } catch { return []; }
}

// ── Enrichment: Constraint Coverage Stats ──────────────────────────

export interface ConstraintCoverageRow {
  constraint: string;
  addressed_count: number;
  total_count: number;
  coverage_pct: number;
}

export function getConstraintCoverage(promptId?: string): ConstraintCoverageRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "response_context") || !hasTable(db, "prompt_metadata")) return [];

    // Get all prompt constraints and their coverage from response_context
    let metaQuery = "SELECT prompt_id, constraints FROM prompt_metadata";
    const metaParams: string[] = [];
    if (promptId) {
      metaQuery += " WHERE prompt_id = ?";
      metaParams.push(promptId);
    }
    const metas = db.prepare(metaQuery).all(...metaParams) as Array<{ prompt_id: string; constraints: string }>;

    let rcQuery = "SELECT prompt_id, constraints_addressed FROM response_context";
    const rcParams: string[] = [];
    if (promptId) {
      rcQuery += " WHERE prompt_id = ?";
      rcParams.push(promptId);
    }
    const contexts = db.prepare(rcQuery).all(...rcParams) as Array<{ prompt_id: string; constraints_addressed: string }>;

    // Build constraint → coverage map
    const constraintTotals = new Map<string, number>();
    const constraintAddressed = new Map<string, number>();

    for (const meta of metas) {
      try {
        const constraints = JSON.parse(meta.constraints) as string[];
        // Count how many response_context rows exist for this prompt
        const responseCount = contexts.filter(c => c.prompt_id === meta.prompt_id).length;
        for (const c of constraints) {
          constraintTotals.set(c, (constraintTotals.get(c) || 0) + responseCount);
        }
      } catch { /* skip bad JSON */ }
    }

    for (const ctx of contexts) {
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

export function getPromptEnrichmentSummaries(): PromptEnrichmentSummary[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "response_context") || !hasTable(db, "prompt_metadata")) return [];

    const metas = db.prepare("SELECT * FROM prompt_metadata ORDER BY prompt_id").all() as PromptMetadataWebRow[];
    const allContexts = db.prepare("SELECT * FROM response_context").all() as ResponseContextWebRow[];

    const results: PromptEnrichmentSummary[] = [];

    for (const meta of metas) {
      const contexts = allContexts.filter(c => c.prompt_id === meta.prompt_id);
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

function safeJsonParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
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

export function getCategorySummaries(): CategorySummary[] {
  const summaries = getPromptEnrichmentSummaries();
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

export function getEnrichmentByCategory(category: string): CategoryDetail {
  const allSummaries = getPromptEnrichmentSummaries();
  const prompts = allSummaries.filter(s => s.category === category);

  const db = getDb();
  if (!db || prompts.length === 0) {
    return { prompts, promptMetadata: [], responses: [], vendorCounts: [], constraintCoverage: [] };
  }

  try {
    if (!hasTable(db, "prompt_metadata") || !hasTable(db, "response_context")) {
      return { prompts, promptMetadata: [], responses: [], vendorCounts: [], constraintCoverage: [] };
    }

    const promptIds = prompts.map(p => p.prompt_id);
    const placeholders = promptIds.map(() => "?").join(",");

    const promptMetadata = db.prepare(
      `SELECT * FROM prompt_metadata WHERE category = ? ORDER BY prompt_id`
    ).all(category) as PromptMetadataWebRow[];

    const responses = db.prepare(
      `SELECT rc.*, s.source_platform
       FROM response_context rc
       JOIN sessions s ON rc.session_id = s.id
       WHERE rc.prompt_id IN (${placeholders})
       ORDER BY rc.prompt_id, s.source_platform`
    ).all(...promptIds) as (ResponseContextWebRow & { source_platform: string })[];

    const vendorCounts = getPrimaryVendorCounts({ category });
    const constraintCoverage = getConstraintCoverageForCategory(category, promptMetadata, responses);

    return { prompts, promptMetadata, responses, vendorCounts, constraintCoverage };
  } catch {
    return { prompts, promptMetadata: [], responses: [], vendorCounts: [], constraintCoverage: [] };
  }
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
