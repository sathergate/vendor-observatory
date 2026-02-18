import Database from "better-sqlite3";
import { resolve, dirname } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type {
  IngestedFileRow,
  SessionRow,
  ObservationRow,
  ToolActionRow,
  VendorMention,
  VendorStats,
  PlatformStats,
  CoOccurrence,
  TimelinePoint,
  FunnelStats,
  DashboardStats,
  PromptMetadataRow,
  ResponseContextRow,
  ExtractedResponseContext,
  IntentClassification,
  DisqualificationReason,
} from "@obs/shared";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ingested_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  file_size INTEGER NOT NULL,
  file_mtime TEXT NOT NULL,
  source_platform TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  session_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  source_platform TEXT NOT NULL,
  model_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  cwd TEXT,
  git_branch TEXT,
  turn_count INTEGER DEFAULT 0,
  file_path TEXT NOT NULL,
  is_benchmark INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  vendor_canonical_id TEXT NOT NULL,
  vendor_raw TEXT NOT NULL,
  mention_type TEXT NOT NULL,
  work_category TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  context_snippet TEXT,
  user_prompt_snippet TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  UNIQUE(session_id, vendor_canonical_id, mention_type)
);

CREATE TABLE IF NOT EXISTS tool_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  command_or_path TEXT,
  vendor_canonical_id TEXT,
  action_type TEXT,
  success INTEGER,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS prompt_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  content_tags TEXT NOT NULL DEFAULT '[]',
  pattern_tags TEXT NOT NULL DEFAULT '[]',
  constraints TEXT NOT NULL DEFAULT '[]',
  existing_stack TEXT NOT NULL DEFAULT '[]',
  failure_mode TEXT,
  vendors_named_in_prompt TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS response_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  primary_vendor TEXT,
  is_implemented INTEGER NOT NULL DEFAULT 0,
  rationale_snippet TEXT,
  vendors_mentioned TEXT NOT NULL DEFAULT '[]',
  trade_offs_snippet TEXT,
  gotchas_snippet TEXT,
  constraints_addressed TEXT NOT NULL DEFAULT '[]',
  reasoning_chain TEXT,
  disqualification_reasons TEXT,
  confidence_score REAL,
  extracted_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  UNIQUE(session_id, prompt_id)
);

CREATE TABLE IF NOT EXISTS prompt_intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  sub_intent TEXT,
  classifier TEXT NOT NULL DEFAULT 'rule',
  classified_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  UNIQUE(session_id, prompt_id)
);

CREATE INDEX IF NOT EXISTS idx_observations_vendor ON observations(vendor_canonical_id);
CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(session_id);
CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(mention_type);
CREATE INDEX IF NOT EXISTS idx_sessions_platform ON sessions(source_platform);
CREATE INDEX IF NOT EXISTS idx_tool_actions_session ON tool_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_actions_vendor ON tool_actions(vendor_canonical_id);
CREATE INDEX IF NOT EXISTS idx_prompt_metadata_category ON prompt_metadata(category);
CREATE INDEX IF NOT EXISTS idx_response_context_session ON response_context(session_id);
CREATE INDEX IF NOT EXISTS idx_response_context_prompt ON response_context(prompt_id);
CREATE INDEX IF NOT EXISTS idx_response_context_vendor ON response_context(primary_vendor);
CREATE INDEX IF NOT EXISTS idx_prompt_intents_session ON prompt_intents(session_id);
CREATE INDEX IF NOT EXISTS idx_prompt_intents_prompt ON prompt_intents(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_intents_intent ON prompt_intents(intent);
`;

export class ObservatoryDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || resolve(process.cwd(), "db", "observatory.sqlite");
    const dir = dirname(resolvedPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.init();
  }

  private init(): void {
    this.db.exec(SCHEMA);
    this.migrate();
  }

  private migrate(): void {
    // Add is_benchmark column if missing (for existing databases)
    const cols = this.db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "is_benchmark")) {
      this.db.exec("ALTER TABLE sessions ADD COLUMN is_benchmark INTEGER NOT NULL DEFAULT 0");
    }

    // Ensure prompt_metadata and response_context tables exist (for DBs created before enrichment)
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));
    if (!tableNames.has("prompt_metadata")) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS prompt_metadata (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          prompt_id TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL,
          content_tags TEXT NOT NULL DEFAULT '[]',
          pattern_tags TEXT NOT NULL DEFAULT '[]',
          constraints TEXT NOT NULL DEFAULT '[]',
          existing_stack TEXT NOT NULL DEFAULT '[]',
          failure_mode TEXT,
          vendors_named_in_prompt TEXT NOT NULL DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_prompt_metadata_category ON prompt_metadata(category);
      `);
    }
    if (!tableNames.has("response_context")) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS response_context (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          prompt_id TEXT NOT NULL,
          primary_vendor TEXT,
          is_implemented INTEGER NOT NULL DEFAULT 0,
          rationale_snippet TEXT,
          vendors_mentioned TEXT NOT NULL DEFAULT '[]',
          trade_offs_snippet TEXT,
          gotchas_snippet TEXT,
          constraints_addressed TEXT NOT NULL DEFAULT '[]',
          reasoning_chain TEXT,
          disqualification_reasons TEXT,
          confidence_score REAL,
          extracted_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id),
          UNIQUE(session_id, prompt_id)
        );
        CREATE INDEX IF NOT EXISTS idx_response_context_session ON response_context(session_id);
        CREATE INDEX IF NOT EXISTS idx_response_context_prompt ON response_context(prompt_id);
        CREATE INDEX IF NOT EXISTS idx_response_context_vendor ON response_context(primary_vendor);
      `);
    }

    // Add LLM enrichment columns to response_context if missing
    if (tableNames.has("response_context")) {
      const rcCols = this.db.prepare("PRAGMA table_info(response_context)").all() as Array<{ name: string }>;
      if (!rcCols.some((c) => c.name === "reasoning_chain")) {
        this.db.exec("ALTER TABLE response_context ADD COLUMN reasoning_chain TEXT");
      }
      if (!rcCols.some((c) => c.name === "disqualification_reasons")) {
        this.db.exec("ALTER TABLE response_context ADD COLUMN disqualification_reasons TEXT");
      }
      if (!rcCols.some((c) => c.name === "confidence_score")) {
        this.db.exec("ALTER TABLE response_context ADD COLUMN confidence_score REAL");
      }
    }

    // Create search_index FTS5 virtual table if missing
    if (!tableNames.has("search_index")) {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
          source_type,
          source_id UNINDEXED,
          vendor,
          category,
          platform,
          prompt_id,
          text_content,
          tokenize='porter unicode61'
        );
      `);
    }

    // Create cross_session_insights table if missing
    if (!tableNames.has("cross_session_insights")) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cross_session_insights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          insight_type TEXT NOT NULL,
          prompt_id TEXT,
          insight_data TEXT NOT NULL,
          generated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_insights_type ON cross_session_insights(insight_type);
      `);
    }

    // Create analysis_snapshots table if missing
    if (!tableNames.has("analysis_snapshots")) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS analysis_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          snapshot_date TEXT NOT NULL,
          prompt_id TEXT NOT NULL,
          platform TEXT NOT NULL,
          primary_vendor TEXT,
          constraints_addressed TEXT,
          UNIQUE(snapshot_date, prompt_id, platform)
        );
      `);
    }

    // Create daily_digests table if missing
    if (!tableNames.has("daily_digests")) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS daily_digests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_date TEXT NOT NULL UNIQUE,
          summary TEXT,
          significant_changes TEXT,
          alerts TEXT,
          generated_at TEXT NOT NULL
        );
      `);
    }

    // Create prompt_intents table if missing
    if (!tableNames.has("prompt_intents")) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS prompt_intents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          prompt_id TEXT NOT NULL,
          intent TEXT NOT NULL,
          confidence REAL NOT NULL DEFAULT 0,
          sub_intent TEXT,
          classifier TEXT NOT NULL DEFAULT 'rule',
          classified_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id),
          UNIQUE(session_id, prompt_id)
        );
        CREATE INDEX IF NOT EXISTS idx_prompt_intents_session ON prompt_intents(session_id);
        CREATE INDEX IF NOT EXISTS idx_prompt_intents_prompt ON prompt_intents(prompt_id);
        CREATE INDEX IF NOT EXISTS idx_prompt_intents_intent ON prompt_intents(intent);
      `);
    }
  }

  getIngestedFile(filePath: string): IngestedFileRow | null {
    return (this.db.prepare("SELECT * FROM ingested_files WHERE file_path = ?").get(filePath) as IngestedFileRow) || null;
  }

  upsertIngestedFile(filePath: string, fileSize: number, fileMtime: string, sourcePlatform: string, sessionCount: number): void {
    this.db.prepare(`
      INSERT INTO ingested_files (file_path, file_size, file_mtime, source_platform, ingested_at, session_count)
      VALUES (?, ?, ?, ?, datetime('now'), ?)
      ON CONFLICT(file_path) DO UPDATE SET file_size = excluded.file_size, file_mtime = excluded.file_mtime,
        ingested_at = datetime('now'), session_count = excluded.session_count
    `).run(filePath, fileSize, fileMtime, sourcePlatform, sessionCount);
  }

  needsReingestion(filePath: string, fileSize: number, fileMtime: string): boolean {
    const existing = this.getIngestedFile(filePath);
    if (!existing) return true;
    return existing.file_size !== fileSize || existing.file_mtime !== fileMtime;
  }

  upsertSession(session: { id: string; sourcePlatform: string; modelId: string | null; startedAt: string; endedAt: string | null; cwd: string | null; gitBranch: string | null; turnCount: number; filePath: string; }): void {
    const isBenchmark = (session.cwd && session.cwd.includes("obs-bench")) || session.gitBranch === "__obs_bench__" ? 1 : 0;
    this.db.prepare(`
      INSERT INTO sessions (id, source_platform, model_id, started_at, ended_at, cwd, git_branch, turn_count, file_path, is_benchmark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET model_id = excluded.model_id, started_at = excluded.started_at, ended_at = excluded.ended_at,
        cwd = excluded.cwd, git_branch = excluded.git_branch, turn_count = excluded.turn_count, file_path = excluded.file_path, is_benchmark = excluded.is_benchmark
    `).run(session.id, session.sourcePlatform, session.modelId, session.startedAt, session.endedAt, session.cwd, session.gitBranch, session.turnCount, session.filePath, isBenchmark);
  }

  deleteSessionsByFilePath(filePath: string): void {
    const sessions = this.db.prepare("SELECT id FROM sessions WHERE file_path = ?").all(filePath) as { id: string }[];
    for (const s of sessions) {
      this.db.prepare("DELETE FROM tool_actions WHERE session_id = ?").run(s.id);
      this.db.prepare("DELETE FROM observations WHERE session_id = ?").run(s.id);
    }
    this.db.prepare("DELETE FROM sessions WHERE file_path = ?").run(filePath);
  }

  insertObservation(sessionId: string, mention: VendorMention): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO observations
        (session_id, vendor_canonical_id, vendor_raw, mention_type, work_category, confidence, context_snippet, user_prompt_snippet, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, mention.vendorCanonicalId, mention.vendorRaw, mention.mentionType, mention.workCategory, mention.confidence, mention.contextSnippet, mention.userPromptSnippet, mention.timestamp);
  }

  insertToolAction(sessionId: string, toolName: string, commandOrPath: string | null, vendorCanonicalId: string | null, actionType: string | null, success: number | null, timestamp: string): void {
    this.db.prepare(`
      INSERT INTO tool_actions (session_id, tool_name, command_or_path, vendor_canonical_id, action_type, success, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, toolName, commandOrPath, vendorCanonicalId, actionType, success, timestamp);
  }

  runInTransaction<T>(fn: () => T): T { return this.db.transaction(fn)(); }

  getDashboardStats(): DashboardStats {
    const sessions = this.db.prepare("SELECT COUNT(*) AS c FROM sessions").get() as { c: number };
    const observations = this.db.prepare("SELECT COUNT(*) AS c FROM observations").get() as { c: number };
    const vendors = this.db.prepare("SELECT COUNT(DISTINCT vendor_canonical_id) AS c FROM observations").get() as { c: number };
    const platforms = this.db.prepare("SELECT source_platform, COUNT(*) AS c FROM sessions GROUP BY source_platform").all() as Array<{ source_platform: string; c: number }>;
    const lastIngested = this.db.prepare("SELECT MAX(ingested_at) AS t FROM ingested_files").get() as { t: string | null };
    const platformBreakdown: Record<string, number> = {};
    for (const p of platforms) { platformBreakdown[p.source_platform] = p.c; }
    return { totalSessions: sessions.c, totalObservations: observations.c, uniqueVendors: vendors.c, platformBreakdown, lastIngestedAt: lastIngested.t };
  }

  getVendorStats(filters?: { platform?: string; mentionType?: string; workCategory?: string; }): VendorStats[] {
    let whereClause = "1=1";
    const params: string[] = [];
    if (filters?.platform) { whereClause += " AND s.source_platform = ?"; params.push(filters.platform); }
    if (filters?.mentionType) { whereClause += " AND o.mention_type = ?"; params.push(filters.mentionType); }
    if (filters?.workCategory) { whereClause += " AND o.work_category = ?"; params.push(filters.workCategory); }
    const rows = this.db.prepare(`
      SELECT o.vendor_canonical_id, o.work_category AS category, COUNT(*) AS total,
        SUM(CASE WHEN o.mention_type = 'installed' THEN 1 ELSE 0 END) AS installed,
        SUM(CASE WHEN o.mention_type = 'configured' THEN 1 ELSE 0 END) AS configured,
        SUM(CASE WHEN o.mention_type = 'implemented' THEN 1 ELSE 0 END) AS implemented,
        SUM(CASE WHEN o.mention_type = 'recommended' THEN 1 ELSE 0 END) AS recommended,
        SUM(CASE WHEN o.mention_type = 'compared' THEN 1 ELSE 0 END) AS compared,
        SUM(CASE WHEN o.mention_type = 'mentioned' THEN 1 ELSE 0 END) AS mentioned,
        SUM(CASE WHEN o.mention_type = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        GROUP_CONCAT(DISTINCT s.source_platform) AS platforms
      FROM observations o JOIN sessions s ON o.session_id = s.id WHERE ${whereClause}
      GROUP BY o.vendor_canonical_id ORDER BY total DESC
    `).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      vendor_canonical_id: r.vendor_canonical_id as string, display_name: r.vendor_canonical_id as string,
      category: (r.category as string) || "other", total: r.total as number, installed: r.installed as number,
      configured: r.configured as number, implemented: r.implemented as number, recommended: r.recommended as number,
      compared: r.compared as number, mentioned: r.mentioned as number, rejected: r.rejected as number,
      platforms: (r.platforms as string) || "",
    }));
  }

  getPlatformComparison(): PlatformStats[] {
    const rows = this.db.prepare(`
      SELECT o.vendor_canonical_id,
        SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) AS claude_code_count,
        SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END) AS codex_cli_count
      FROM observations o JOIN sessions s ON o.session_id = s.id GROUP BY o.vendor_canonical_id
      ORDER BY (SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) + SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END)) DESC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((r) => {
      const cc = r.claude_code_count as number; const cx = r.codex_cli_count as number;
      return { vendor_canonical_id: r.vendor_canonical_id as string, display_name: r.vendor_canonical_id as string,
        claude_code_count: cc, codex_cli_count: cx, delta: Math.abs(cc - cx) };
    });
  }

  getCoOccurrences(minCount = 2): CoOccurrence[] {
    const rows = this.db.prepare(`
      SELECT a.vendor_canonical_id AS vendor_a, b.vendor_canonical_id AS vendor_b,
        COUNT(DISTINCT a.session_id) AS co_occurrence_count, GROUP_CONCAT(DISTINCT a.session_id) AS sessions
      FROM observations a JOIN observations b ON a.session_id = b.session_id
      WHERE a.vendor_canonical_id < b.vendor_canonical_id
      GROUP BY a.vendor_canonical_id, b.vendor_canonical_id HAVING co_occurrence_count >= ?
      ORDER BY co_occurrence_count DESC LIMIT 100
    `).all(minCount) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ vendor_a: r.vendor_a as string, vendor_b: r.vendor_b as string,
      co_occurrence_count: r.co_occurrence_count as number, sessions: (r.sessions as string) || "" }));
  }

  getTimeline(): TimelinePoint[] {
    const rows = this.db.prepare(`
      SELECT strftime('%Y-W%W', o.timestamp) AS week, o.vendor_canonical_id, COUNT(*) AS count
      FROM observations o GROUP BY week, o.vendor_canonical_id ORDER BY week, count DESC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({ week: r.week as string, vendor_canonical_id: r.vendor_canonical_id as string, count: r.count as number }));
  }

  getActionFunnels(): FunnelStats[] {
    const rows = this.db.prepare(`
      SELECT vendor_canonical_id,
        SUM(CASE WHEN mention_type = 'mentioned' THEN 1 ELSE 0 END) AS mentioned_total,
        SUM(CASE WHEN mention_type = 'recommended' THEN 1 ELSE 0 END) AS recommended_total,
        SUM(CASE WHEN mention_type = 'installed' THEN 1 ELSE 0 END) AS installed_total
      FROM observations GROUP BY vendor_canonical_id
      HAVING (recommended_total + installed_total) > 0
      ORDER BY installed_total DESC, recommended_total DESC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((r) => {
      const rec = r.recommended_total as number; const inst = r.installed_total as number;
      return { vendor_canonical_id: r.vendor_canonical_id as string, display_name: r.vendor_canonical_id as string,
        mentioned_total: r.mentioned_total as number, recommended_total: rec, installed_total: inst,
        conversion_rate: rec > 0 ? inst / rec : 0 };
    });
  }

  getSessions(limit = 50, offset = 0, platform?: string): SessionRow[] {
    let sql = "SELECT * FROM sessions";
    const params: (string | number)[] = [];
    if (platform) { sql += " WHERE source_platform = ?"; params.push(platform); }
    sql += " ORDER BY started_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);
    return this.db.prepare(sql).all(...params) as SessionRow[];
  }

  getSessionById(id: string): SessionRow | null {
    return (this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow) || null;
  }

  getObservationsBySessionId(sessionId: string): ObservationRow[] {
    return this.db.prepare("SELECT * FROM observations WHERE session_id = ? ORDER BY timestamp").all(sessionId) as ObservationRow[];
  }

  getToolActionsBySessionId(sessionId: string): ToolActionRow[] {
    return this.db.prepare("SELECT * FROM tool_actions WHERE session_id = ? ORDER BY timestamp").all(sessionId) as ToolActionRow[];
  }

  // ── Prompt Metadata ──────────────────────────────────────────────

  upsertPromptMetadata(meta: {
    promptId: string;
    category: string;
    contentTags: string[];
    patternTags: string[];
    constraints: string[];
    existingStack: string[];
    failureMode: string | null;
    vendorsNamedInPrompt: string[];
  }): void {
    this.db.prepare(`
      INSERT INTO prompt_metadata (prompt_id, category, content_tags, pattern_tags, constraints, existing_stack, failure_mode, vendors_named_in_prompt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(prompt_id) DO UPDATE SET
        category = excluded.category,
        content_tags = excluded.content_tags,
        pattern_tags = excluded.pattern_tags,
        constraints = excluded.constraints,
        existing_stack = excluded.existing_stack,
        failure_mode = excluded.failure_mode,
        vendors_named_in_prompt = excluded.vendors_named_in_prompt
    `).run(
      meta.promptId,
      meta.category,
      JSON.stringify(meta.contentTags),
      JSON.stringify(meta.patternTags),
      JSON.stringify(meta.constraints),
      JSON.stringify(meta.existingStack),
      meta.failureMode,
      JSON.stringify(meta.vendorsNamedInPrompt),
    );
  }

  getPromptMetadata(promptId: string): PromptMetadataRow | null {
    return (this.db.prepare("SELECT * FROM prompt_metadata WHERE prompt_id = ?").get(promptId) as PromptMetadataRow) || null;
  }

  getAllPromptMetadata(): PromptMetadataRow[] {
    return this.db.prepare("SELECT * FROM prompt_metadata ORDER BY prompt_id").all() as PromptMetadataRow[];
  }

  // ── Response Context ──────────────────────────────────────────────

  upsertResponseContext(ctx: {
    sessionId: string;
    promptId: string;
    primaryVendor: string | null;
    isImplemented: boolean;
    rationaleSnippet: string | null;
    vendorsMentioned: Array<{ vendor: string; disposition: string }>;
    tradeOffsSnippet: string | null;
    gotchasSnippet: string | null;
    constraintsAddressed: string[];
    reasoningChain?: string | null;
    disqualificationReasons?: DisqualificationReason[];
    confidenceScore?: number | null;
  }): void {
    this.db.prepare(`
      INSERT INTO response_context (session_id, prompt_id, primary_vendor, is_implemented, rationale_snippet,
        vendors_mentioned, trade_offs_snippet, gotchas_snippet, constraints_addressed,
        reasoning_chain, disqualification_reasons, confidence_score, extracted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(session_id, prompt_id) DO UPDATE SET
        primary_vendor = excluded.primary_vendor,
        is_implemented = excluded.is_implemented,
        rationale_snippet = excluded.rationale_snippet,
        vendors_mentioned = excluded.vendors_mentioned,
        trade_offs_snippet = excluded.trade_offs_snippet,
        gotchas_snippet = excluded.gotchas_snippet,
        constraints_addressed = excluded.constraints_addressed,
        reasoning_chain = excluded.reasoning_chain,
        disqualification_reasons = excluded.disqualification_reasons,
        confidence_score = excluded.confidence_score,
        extracted_at = datetime('now')
    `).run(
      ctx.sessionId,
      ctx.promptId,
      ctx.primaryVendor,
      ctx.isImplemented ? 1 : 0,
      ctx.rationaleSnippet,
      JSON.stringify(ctx.vendorsMentioned),
      ctx.tradeOffsSnippet,
      ctx.gotchasSnippet,
      JSON.stringify(ctx.constraintsAddressed),
      ctx.reasoningChain ?? null,
      ctx.disqualificationReasons ? JSON.stringify(ctx.disqualificationReasons) : null,
      ctx.confidenceScore ?? null,
    );
  }

  // ── Prompt Intents ──────────────────────────────────────────────

  upsertPromptIntent(ctx: {
    sessionId: string;
    promptId: string;
    intent: IntentClassification;
  }): void {
    this.db.prepare(`
      INSERT INTO prompt_intents (session_id, prompt_id, intent, confidence, sub_intent, classifier, classified_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(session_id, prompt_id) DO UPDATE SET
        intent = excluded.intent,
        confidence = excluded.confidence,
        sub_intent = excluded.sub_intent,
        classifier = excluded.classifier,
        classified_at = datetime('now')
    `).run(
      ctx.sessionId,
      ctx.promptId,
      ctx.intent.intent,
      ctx.intent.confidence,
      ctx.intent.subIntent,
      ctx.intent.classifier,
    );
  }

  getResponseContextBySession(sessionId: string): ResponseContextRow[] {
    return this.db.prepare("SELECT * FROM response_context WHERE session_id = ?").all(sessionId) as ResponseContextRow[];
  }

  getResponseContextByPrompt(promptId: string): ResponseContextRow[] {
    return this.db.prepare("SELECT * FROM response_context WHERE prompt_id = ? ORDER BY extracted_at DESC").all(promptId) as ResponseContextRow[];
  }

  // ── Enrichment Queries ────────────────────────────────────────────

  getPrimaryVendorCounts(filters?: { promptId?: string; category?: string; platform?: string }): Array<{ primary_vendor: string; count: number }> {
    let where = "rc.primary_vendor IS NOT NULL";
    const params: string[] = [];
    if (filters?.promptId) { where += " AND rc.prompt_id = ?"; params.push(filters.promptId); }
    if (filters?.category) { where += " AND pm.category = ?"; params.push(filters.category); }
    if (filters?.platform) { where += " AND s.source_platform = ?"; params.push(filters.platform); }
    return this.db.prepare(`
      SELECT rc.primary_vendor, COUNT(*) AS count
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
      WHERE ${where}
      GROUP BY rc.primary_vendor ORDER BY count DESC
    `).all(...params) as Array<{ primary_vendor: string; count: number }>;
  }

  getConstraintCoverage(promptId: string): Array<{ session_id: string; source_platform: string; constraints_addressed: string }> {
    return this.db.prepare(`
      SELECT rc.session_id, s.source_platform, rc.constraints_addressed
      FROM response_context rc JOIN sessions s ON rc.session_id = s.id
      WHERE rc.prompt_id = ?
    `).all(promptId) as Array<{ session_id: string; source_platform: string; constraints_addressed: string }>;
  }

  // ── FTS5 Search Index ────────────────────────────────────────────

  populateSearchIndex(entries: Array<{
    sourceType: string;
    sourceId: string;
    vendor: string;
    category: string;
    platform: string;
    promptId: string;
    textContent: string;
  }>): void {
    const insert = this.db.prepare(`
      INSERT INTO search_index (source_type, source_id, vendor, category, platform, prompt_id, text_content)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    // Clear existing entries for these source IDs to avoid duplicates
    const deleteBySource = this.db.prepare("DELETE FROM search_index WHERE source_id = ?");
    for (const entry of entries) {
      if (!entry.textContent || entry.textContent.trim().length < 10) continue;
      deleteBySource.run(entry.sourceId);
      insert.run(
        entry.sourceType,
        entry.sourceId,
        entry.vendor,
        entry.category,
        entry.platform,
        entry.promptId,
        entry.textContent,
      );
    }
  }

  // ── Cross-Session Insights ─────────────────────────────────────────

  upsertInsight(type: string, promptId: string | null, data: unknown): void {
    if (promptId) {
      // Delete existing insight of this type for this prompt
      this.db.prepare(
        "DELETE FROM cross_session_insights WHERE insight_type = ? AND prompt_id = ?"
      ).run(type, promptId);
    } else {
      // Delete all insights of this type (global insights)
      this.db.prepare(
        "DELETE FROM cross_session_insights WHERE insight_type = ? AND prompt_id IS NULL"
      ).run(type);
    }
    this.db.prepare(`
      INSERT INTO cross_session_insights (insight_type, prompt_id, insight_data, generated_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(type, promptId, JSON.stringify(data));
  }

  getInsightsByType(type: string): Array<{ id: number; insight_type: string; prompt_id: string | null; insight_data: string; generated_at: string }> {
    return this.db.prepare(
      "SELECT * FROM cross_session_insights WHERE insight_type = ? ORDER BY generated_at DESC"
    ).all(type) as Array<{ id: number; insight_type: string; prompt_id: string | null; insight_data: string; generated_at: string }>;
  }

  // ── Analysis Snapshots ────────────────────────────────────────────

  upsertSnapshot(snapshotDate: string, promptId: string, platform: string, primaryVendor: string | null, constraintsAddressed: string[]): void {
    this.db.prepare(`
      INSERT INTO analysis_snapshots (snapshot_date, prompt_id, platform, primary_vendor, constraints_addressed)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_date, prompt_id, platform) DO UPDATE SET
        primary_vendor = excluded.primary_vendor,
        constraints_addressed = excluded.constraints_addressed
    `).run(snapshotDate, promptId, platform, primaryVendor, JSON.stringify(constraintsAddressed));
  }

  getSnapshot(date: string): Array<{ prompt_id: string; platform: string; primary_vendor: string | null; constraints_addressed: string }> {
    return this.db.prepare(
      "SELECT prompt_id, platform, primary_vendor, constraints_addressed FROM analysis_snapshots WHERE snapshot_date = ?"
    ).all(date) as Array<{ prompt_id: string; platform: string; primary_vendor: string | null; constraints_addressed: string }>;
  }

  getPreviousSnapshotDate(beforeDate: string): string | null {
    const row = this.db.prepare(
      "SELECT DISTINCT snapshot_date FROM analysis_snapshots WHERE snapshot_date < ? ORDER BY snapshot_date DESC LIMIT 1"
    ).get(beforeDate) as { snapshot_date: string } | undefined;
    return row?.snapshot_date ?? null;
  }

  // ── Daily Digests ─────────────────────────────────────────────────

  upsertDailyDigest(runDate: string, summary: string | null, significantChanges: unknown, alerts: unknown): void {
    this.db.prepare(`
      INSERT INTO daily_digests (run_date, summary, significant_changes, alerts, generated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(run_date) DO UPDATE SET
        summary = excluded.summary,
        significant_changes = excluded.significant_changes,
        alerts = excluded.alerts,
        generated_at = datetime('now')
    `).run(runDate, summary, JSON.stringify(significantChanges), JSON.stringify(alerts));
  }

  getLatestDigests(limit = 10): Array<{ run_date: string; summary: string | null; significant_changes: string; alerts: string; generated_at: string }> {
    return this.db.prepare(
      "SELECT * FROM daily_digests ORDER BY run_date DESC LIMIT ?"
    ).all(limit) as Array<{ run_date: string; summary: string | null; significant_changes: string; alerts: string; generated_at: string }>;
  }

  // ── All Response Contexts (for analyzer) ──────────────────────────

  getAllResponseContexts(): Array<{
    session_id: string;
    prompt_id: string;
    primary_vendor: string | null;
    vendors_mentioned: string;
    constraints_addressed: string;
    is_implemented: number;
    rationale_snippet: string | null;
    trade_offs_snippet: string | null;
    gotchas_snippet: string | null;
    extracted_at: string;
    source_platform: string;
    category: string | null;
  }> {
    return this.db.prepare(`
      SELECT rc.*, s.source_platform, pm.category
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
    `).all() as Array<{
      session_id: string; prompt_id: string; primary_vendor: string | null;
      vendors_mentioned: string; constraints_addressed: string; is_implemented: number;
      rationale_snippet: string | null; trade_offs_snippet: string | null;
      gotchas_snippet: string | null; extracted_at: string; source_platform: string;
      category: string | null;
    }>;
  }

  close(): void { this.db.close(); }
}
