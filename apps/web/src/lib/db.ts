import Database from "better-sqlite3";
import path from "path";
import { existsSync } from "fs";

// ── Lazy DB initialization ──────────────────────────────────────────

let _db: Database.Database | null = null;
let _dbFailed = false;

function findDbPath(): string {
  // Explicit env var takes priority
  if (process.env.OBS_DB_PATH) return process.env.OBS_DB_PATH;

  // Try multiple candidate locations (local dev vs Vercel)
  const candidates = [
    path.resolve(process.cwd(), "../../db/observatory.sqlite"),  // local dev from apps/web
    path.resolve(process.cwd(), "db/observatory.sqlite"),         // Vercel serverless
    path.resolve(__dirname, "../../db/observatory.sqlite"),        // relative to compiled output
    path.resolve(__dirname, "../../../db/observatory.sqlite"),
    path.resolve(__dirname, "../../../../db/observatory.sqlite"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]; // fallback — will fail with clear error
}

function getDb(): Database.Database | null {
  if (_dbFailed) return null;
  if (_db) return _db;
  try {
    const dbPath = findDbPath();
    _db = new Database(dbPath, { readonly: true, fileMustExist: true });
    _db.pragma("journal_mode = WAL");
    return _db;
  } catch {
    _dbFailed = false;
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
