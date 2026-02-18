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

export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
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

export function getVendorScorecard(vendor: string): VendorScorecard | null {
  const db = getDb();
  if (!db) return null;
  try {
    if (!hasTable(db, "response_context") || !hasTable(db, "prompt_metadata")) return null;

    // All responses where this vendor is mentioned in vendors_mentioned JSON or is primary_vendor
    const allResponses = db.prepare(`
      SELECT rc.*, s.source_platform, pm.category, pm.constraints
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
    `).all() as Array<ResponseContextWebRow & { source_platform: string; category: string; constraints: string }>;

    // Find all responses mentioning this vendor
    const mentionedIn: typeof allResponses = [];
    const recommendedIn: typeof allResponses = [];
    const rejectedIn: typeof allResponses = [];
    const comparedIn: typeof allResponses = [];
    let implementedCount = 0;

    for (const r of allResponses) {
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

    // Constraints missed (constraints in prompts where this vendor was mentioned but didn't win)
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

    // Competitor wins: who won when this vendor was mentioned but lost
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
    const tradeOffSnippets = allResponses
      .filter(r => r.primary_vendor === vendor && r.trade_offs_snippet)
      .map(r => r.trade_offs_snippet!)
      .filter(s => s.length > 5);
    const gotchaSnippets = allResponses
      .filter(r => r.primary_vendor === vendor && r.gotchas_snippet)
      .map(r => r.gotchas_snippet!)
      .filter(s => s.length > 5);
    const rationaleSnippets = allResponses
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

    // Loss context: for each loss, capture the winner's constraints and the prompt's constraints
    const lossContext: VendorScorecard["lossContext"] = [];
    for (const r of mentionedIn) {
      if (r.primary_vendor && r.primary_vendor !== vendor) {
        // Find the winner's response to get their constraints_addressed
        const winnerResponse = allResponses.find(
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

    // Implementation context: for each recommendation, track implementation status
    const implementationContext: VendorScorecard["implementationContext"] = [];
    for (const r of recommendedIn) {
      implementationContext.push({
        prompt_id: r.prompt_id,
        category: r.category || "unknown",
        platform: r.source_platform,
        isImplemented: !!r.is_implemented,
      });
    }

    // All prompt constraints: map prompt_id → constraints for all mentioned prompts
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

export interface VendorListItem {
  vendor: string;
  totalRecommendations: number;
  totalMentions: number;
  winRate: number;
  implementationRate: number;
  topCategory: string | null;
  platforms: string[];
}

export function getAllVendorNames(): VendorListItem[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "response_context") || !hasTable(db, "prompt_metadata")) return [];

    const allResponses = db.prepare(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, rc.is_implemented,
             s.source_platform, pm.category
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
    `).all() as Array<{
      primary_vendor: string | null;
      vendors_mentioned: string;
      is_implemented: number;
      source_platform: string;
      category: string;
    }>;

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

    for (const r of allResponses) {
      // Track primary vendor
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

      // Track all mentioned vendors
      const vendors = safeJsonParse<Array<{ vendor: string; disposition: string }>>(r.vendors_mentioned, []);
      for (const v of vendors) {
        if (v.vendor === r.primary_vendor) continue; // already counted
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

export function getVendorHeadToHead(vendorA: string, vendorB: string): HeadToHeadResult {
  const db = getDb();
  const empty: HeadToHeadResult = { vendorA, vendorB, scenarios: [], aWins: 0, bWins: 0, ties: 0 };
  if (!db) return empty;
  try {
    if (!hasTable(db, "response_context") || !hasTable(db, "prompt_metadata")) return empty;

    const allResponses = db.prepare(`
      SELECT rc.prompt_id, rc.primary_vendor, rc.vendors_mentioned, rc.rationale_snippet,
             pm.category
      FROM response_context rc
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
    `).all() as Array<{
      prompt_id: string;
      primary_vendor: string | null;
      vendors_mentioned: string;
      rationale_snippet: string | null;
      category: string;
    }>;

    const scenarios: HeadToHeadResult["scenarios"] = [];
    let aWins = 0, bWins = 0, ties = 0;

    for (const r of allResponses) {
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

// ── Temporal Trends ─────────────────────────────────────────────────

export interface TrendDataPoint {
  weekStart: string;  // ISO date string (Monday of each week)
  recommendations: number;
  mentions: number;
  winRate: number;
}

export interface VendorTrend {
  vendor: string;
  dataPoints: TrendDataPoint[];
  currentWinRate: number;
  previousWinRate: number;
  winRateDelta: number;   // positive = gaining, negative = losing
  currentMentions: number;
  previousMentions: number;
  mentionDelta: number;
  trend: "rising" | "falling" | "stable";
}

export function getVendorTrend(vendor: string, windowDays = 60): VendorTrend | null {
  const db = getDb();
  if (!db) return null;
  try {
    if (!hasTable(db, "response_context") || !hasTable(db, "prompt_metadata")) return null;

    const allResponses = db.prepare(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, rc.extracted_at,
             s.started_at, s.source_platform
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      WHERE rc.extracted_at >= date('now', '-${windowDays} days')
         OR s.started_at >= date('now', '-${windowDays} days')
    `).all() as Array<{
      primary_vendor: string | null;
      vendors_mentioned: string;
      extracted_at: string;
      started_at: string;
      source_platform: string;
    }>;

    // Group by week
    const weekMap = new Map<string, { recommendations: number; mentions: number }>();

    for (const r of allResponses) {
      const dateStr = r.extracted_at || r.started_at;
      if (!dateStr) continue;

      const date = new Date(dateStr);
      // Get Monday of the week
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

    // Compute trend: compare first half vs second half
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

export function getAllVendorTrends(): VendorTrend[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "response_context")) return [];

    // Get all vendors mentioned in response_context
    const allResponses = db.prepare(`
      SELECT rc.primary_vendor, rc.vendors_mentioned, rc.extracted_at,
             s.started_at
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
    `).all() as Array<{
      primary_vendor: string | null;
      vendors_mentioned: string;
      extracted_at: string;
      started_at: string;
    }>;

    // Collect all unique vendors
    const vendorSet = new Set<string>();
    for (const r of allResponses) {
      if (r.primary_vendor) vendorSet.add(r.primary_vendor);
      const vendors = safeJsonParse<Array<{ vendor: string; disposition: string }>>(r.vendors_mentioned, []);
      for (const v of vendors) vendorSet.add(v.vendor);
    }

    // Compute trends for each vendor
    const trends: VendorTrend[] = [];
    for (const vendor of vendorSet) {
      const trend = getVendorTrend(vendor);
      if (trend && trend.dataPoints.length > 0) {
        trends.push(trend);
      }
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
  is_contested: boolean;     // no single vendor > 50%
  is_dominated: boolean;     // one vendor wins 100%
  content_tags: string[];
  pattern_tags: string[];
  constraints: string[];
}

export function getPromptLeaderboard(): PromptLeaderboardRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "response_context") || !hasTable(db, "prompt_metadata")) return [];

    const metas = db.prepare("SELECT * FROM prompt_metadata ORDER BY prompt_id").all() as PromptMetadataWebRow[];
    const allContexts = db.prepare("SELECT * FROM response_context").all() as ResponseContextWebRow[];

    const results: PromptLeaderboardRow[] = [];

    for (const meta of metas) {
      const contexts = allContexts.filter(c => c.prompt_id === meta.prompt_id);
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
        // Track all mentioned vendors
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
  prompt_count: number;        // how many prompts require it
  response_count: number;      // how many responses faced it
  coverage_rate: number;       // how often it's addressed
  top_vendor: string | null;   // vendor that addresses it most
  top_vendor_count: number;
}

export function getConstraintDemand(): ConstraintDemandRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "response_context") || !hasTable(db, "prompt_metadata")) return [];

    const metas = db.prepare("SELECT * FROM prompt_metadata").all() as PromptMetadataWebRow[];
    const allContexts = db.prepare("SELECT * FROM response_context").all() as ResponseContextWebRow[];

    const constraintMap = new Map<string, {
      promptIds: Set<string>;
      totalResponses: number;
      addressedCount: number;
      vendorAddressed: Map<string, number>;
    }>();

    // Count how many prompts each constraint appears in
    for (const meta of metas) {
      const constraints = safeJsonParse<string[]>(meta.constraints, []);
      const contexts = allContexts.filter(c => c.prompt_id === meta.prompt_id);

      for (const c of constraints) {
        if (!constraintMap.has(c)) {
          constraintMap.set(c, { promptIds: new Set(), totalResponses: 0, addressedCount: 0, vendorAddressed: new Map() });
        }
        const entry = constraintMap.get(c)!;
        entry.promptIds.add(meta.prompt_id);
        entry.totalResponses += contexts.length;
      }
    }

    // Count how often each constraint is addressed
    for (const ctx of allContexts) {
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

export function getIntentDistribution(): IntentDistributionRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "prompt_intents")) return [];

    const rows = db.prepare(`
      SELECT
        pi.intent,
        COUNT(*) AS count,
        AVG(pi.confidence) AS avg_confidence
      FROM prompt_intents pi
      WHERE pi.intent != 'unknown'
      GROUP BY pi.intent
      ORDER BY count DESC
    `).all() as Array<{ intent: string; count: number; avg_confidence: number }>;

    const total = rows.reduce((s, r) => s + r.count, 0);

    // For each intent, find the top vendor
    const results: IntentDistributionRow[] = [];
    for (const row of rows) {
      let topVendor: string | null = null;
      let topVendorCount = 0;
      try {
        const vendorRow = db.prepare(`
          SELECT rc.primary_vendor, COUNT(*) AS cnt
          FROM prompt_intents pi
          JOIN response_context rc ON pi.session_id = rc.session_id AND pi.prompt_id = rc.prompt_id
          WHERE pi.intent = ? AND rc.primary_vendor IS NOT NULL
          GROUP BY rc.primary_vendor
          ORDER BY cnt DESC
          LIMIT 1
        `).get(row.intent) as { primary_vendor: string; cnt: number } | undefined;
        if (vendorRow) {
          topVendor = vendorRow.primary_vendor;
          topVendorCount = vendorRow.cnt;
        }
      } catch { /* join may fail if tables misaligned */ }

      results.push({
        intent: row.intent,
        count: row.count,
        pct: total > 0 ? row.count / total : 0,
        avg_confidence: row.avg_confidence,
        top_vendor: topVendor,
        top_vendor_count: topVendorCount,
      });
    }

    return results;
  } catch { return []; }
}

export function getIntentVendorMatrix(): IntentVendorRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "prompt_intents") || !hasTable(db, "response_context")) return [];

    const rows = db.prepare(`
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
    `).all() as Array<{ intent: string; vendor: string; wins: number; total: number }>;

    return rows.map((r) => ({
      ...r,
      win_rate: r.total > 0 ? r.wins / r.total : 0,
    }));
  } catch { return []; }
}

// ── FTS5 Search ──────────────────────────────────────────────────────

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

export function searchCorpus(
  query: string,
  filters?: { vendor?: string; category?: string; platform?: string; sourceType?: string },
  limit = 20,
): SearchResult[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "search_index")) return [];

    let whereClause = "";
    const params: (string | number)[] = [];

    if (filters?.vendor) {
      whereClause += " AND vendor = ?";
      params.push(filters.vendor);
    }
    if (filters?.category) {
      whereClause += " AND category = ?";
      params.push(filters.category);
    }
    if (filters?.platform) {
      whereClause += " AND platform = ?";
      params.push(filters.platform);
    }
    if (filters?.sourceType) {
      whereClause += " AND source_type = ?";
      params.push(filters.sourceType);
    }

    params.push(limit);

    return db.prepare(`
      SELECT source_type, source_id, vendor, category, platform, prompt_id,
             snippet(search_index, 6, '<mark>', '</mark>', '...', 40) AS snippet,
             bm25(search_index) AS rank
      FROM search_index
      WHERE search_index MATCH ?
      ${whereClause}
      ORDER BY rank
      LIMIT ?
    `).all(query, ...params) as SearchResult[];
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

export function getDivergenceMatrix(): DivergenceInsight[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "cross_session_insights")) return [];
    const rows = db.prepare(
      "SELECT insight_data FROM cross_session_insights WHERE insight_type = 'divergence' ORDER BY generated_at DESC"
    ).all() as Array<{ insight_data: string }>;
    return rows.map((r) => safeJsonParse<DivergenceInsight>(r.insight_data, { promptId: "", platforms: {}, isDivergent: false, divergenceScore: 0 }));
  } catch { return []; }
}

export function getConstraintInfluence(): ConstraintInfluenceInsight[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "cross_session_insights")) return [];
    const rows = db.prepare(
      "SELECT insight_data FROM cross_session_insights WHERE insight_type = 'constraint_influence' ORDER BY generated_at DESC"
    ).all() as Array<{ insight_data: string }>;
    return rows.map((r) => safeJsonParse<ConstraintInfluenceInsight>(r.insight_data, { constraint: "", influenceScore: 0, vendorShifts: [] }));
  } catch { return []; }
}

export function getTemporalDrift(): DriftInsight[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "cross_session_insights")) return [];
    const rows = db.prepare(
      "SELECT insight_data FROM cross_session_insights WHERE insight_type = 'temporal_drift' ORDER BY generated_at DESC"
    ).all() as Array<{ insight_data: string }>;
    return rows.map((r) => safeJsonParse<DriftInsight>(r.insight_data, { vendor: "", earlyWinRate: 0, lateWinRate: 0, delta: 0, isSignificant: false }));
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

export function getLatestDigests(limit = 5): DigestRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    if (!hasTable(db, "daily_digests")) return [];
    const rows = db.prepare(
      "SELECT * FROM daily_digests ORDER BY run_date DESC LIMIT ?"
    ).all(limit) as Array<{
      run_date: string;
      summary: string | null;
      significant_changes: string;
      alerts: string;
    }>;
    return rows.map((r) => ({
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
