import { Pool, PoolClient } from "pg";
import type {
  IngestedFileRow,
  SessionRow,
  ObservationRow,
  ToolActionRow,
  VendorMention,
  VendorRejection,
  VendorRejectionRow,
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

// ── Schema (split into individual statements for pg) ──────────────────

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ingested_files (
    id SERIAL PRIMARY KEY,
    file_path TEXT NOT NULL UNIQUE,
    file_size INTEGER NOT NULL,
    file_mtime TEXT NOT NULL,
    source_platform TEXT NOT NULL,
    ingested_at TEXT NOT NULL,
    session_count INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    source_platform TEXT NOT NULL,
    model_id TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    cwd TEXT,
    git_branch TEXT,
    turn_count INTEGER DEFAULT 0,
    file_path TEXT NOT NULL,
    is_benchmark BOOLEAN NOT NULL DEFAULT FALSE
  )`,

  `CREATE TABLE IF NOT EXISTS observations (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    vendor_canonical_id TEXT NOT NULL,
    vendor_raw TEXT NOT NULL,
    mention_type TEXT NOT NULL,
    work_category TEXT,
    confidence REAL NOT NULL DEFAULT 1.0,
    context_snippet TEXT,
    user_prompt_snippet TEXT,
    timestamp TEXT NOT NULL,
    UNIQUE(session_id, vendor_canonical_id, mention_type)
  )`,

  `CREATE TABLE IF NOT EXISTS tool_actions (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    tool_name TEXT NOT NULL,
    command_or_path TEXT,
    vendor_canonical_id TEXT,
    action_type TEXT,
    success INTEGER,
    timestamp TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS prompt_metadata (
    id SERIAL PRIMARY KEY,
    prompt_id TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    content_tags TEXT NOT NULL DEFAULT '[]',
    pattern_tags TEXT NOT NULL DEFAULT '[]',
    constraints TEXT NOT NULL DEFAULT '[]',
    existing_stack TEXT NOT NULL DEFAULT '[]',
    failure_mode TEXT,
    vendors_named_in_prompt TEXT NOT NULL DEFAULT '[]'
  )`,

  `CREATE TABLE IF NOT EXISTS response_context (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    prompt_id TEXT NOT NULL,
    primary_vendor TEXT,
    is_implemented BOOLEAN NOT NULL DEFAULT FALSE,
    is_custom_diy BOOLEAN NOT NULL DEFAULT FALSE,
    rationale_snippet TEXT,
    vendors_mentioned TEXT NOT NULL DEFAULT '[]',
    trade_offs_snippet TEXT,
    gotchas_snippet TEXT,
    constraints_addressed TEXT NOT NULL DEFAULT '[]',
    reasoning_chain TEXT,
    disqualification_reasons TEXT,
    confidence_score REAL,
    extracted_at TEXT NOT NULL,
    UNIQUE(session_id, prompt_id)
  )`,

  `CREATE TABLE IF NOT EXISTS prompt_intents (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    prompt_id TEXT NOT NULL,
    intent TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0,
    sub_intent TEXT,
    classifier TEXT NOT NULL DEFAULT 'rule',
    classified_at TEXT NOT NULL,
    UNIQUE(session_id, prompt_id)
  )`,

  `CREATE TABLE IF NOT EXISTS search_index (
    id SERIAL PRIMARY KEY,
    source_type TEXT,
    source_id TEXT,
    vendor TEXT,
    category TEXT,
    platform TEXT,
    prompt_id TEXT,
    text_content TEXT,
    tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', COALESCE(text_content, ''))) STORED
  )`,

  `CREATE TABLE IF NOT EXISTS cross_session_insights (
    id SERIAL PRIMARY KEY,
    insight_type TEXT NOT NULL,
    prompt_id TEXT,
    insight_data TEXT NOT NULL,
    generated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS analysis_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date TEXT NOT NULL,
    prompt_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    primary_vendor TEXT,
    constraints_addressed TEXT,
    UNIQUE(snapshot_date, prompt_id, platform)
  )`,

  `CREATE TABLE IF NOT EXISTS daily_digests (
    id SERIAL PRIMARY KEY,
    run_date TEXT NOT NULL UNIQUE,
    summary TEXT,
    significant_changes TEXT,
    alerts TEXT,
    generated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS categories (
    id              TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    icon            TEXT NOT NULL DEFAULT '📦',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS vendors (
    canonical_id    TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    category        TEXT NOT NULL,
    synonyms        TEXT[] NOT NULL DEFAULT '{}',
    package_names   TEXT[] NOT NULL DEFAULT '{}',
    is_dynamic      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_categories_display_name ON categories(display_name)`,
  `CREATE INDEX IF NOT EXISTS vendors_synonyms_gin ON vendors USING GIN(synonyms)`,
  `CREATE INDEX IF NOT EXISTS vendors_package_names_gin ON vendors USING GIN(package_names)`,
  `CREATE INDEX IF NOT EXISTS vendors_category ON vendors(category)`,
  `CREATE INDEX IF NOT EXISTS idx_observations_vendor ON observations(vendor_canonical_id)`,
  `CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(mention_type)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_platform ON sessions(source_platform)`,
  `CREATE INDEX IF NOT EXISTS idx_tool_actions_session ON tool_actions(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tool_actions_vendor ON tool_actions(vendor_canonical_id)`,
  `CREATE INDEX IF NOT EXISTS idx_prompt_metadata_category ON prompt_metadata(category)`,
  `CREATE INDEX IF NOT EXISTS idx_response_context_session ON response_context(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_response_context_prompt ON response_context(prompt_id)`,
  `CREATE INDEX IF NOT EXISTS idx_response_context_vendor ON response_context(primary_vendor)`,
  `CREATE INDEX IF NOT EXISTS idx_prompt_intents_session ON prompt_intents(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_prompt_intents_prompt ON prompt_intents(prompt_id)`,
  `CREATE INDEX IF NOT EXISTS idx_prompt_intents_intent ON prompt_intents(intent)`,
  `CREATE INDEX IF NOT EXISTS idx_search_tsv ON search_index USING GIN(tsv)`,
  `CREATE INDEX IF NOT EXISTS idx_search_source_id ON search_index(source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_insights_type ON cross_session_insights(insight_type)`,
  `CREATE INDEX IF NOT EXISTS idx_rejections_vendor ON vendor_rejections(vendor_canonical_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rejections_session ON vendor_rejections(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rejections_reason ON vendor_rejections(rejection_reason)`,
  `CREATE INDEX IF NOT EXISTS idx_rejections_alternative ON vendor_rejections(chosen_alternative)`,

  `CREATE TABLE IF NOT EXISTS vendor_rejections (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    vendor_canonical_id TEXT NOT NULL,
    rejection_reason TEXT NOT NULL,
    rejection_reason_detail TEXT,
    chosen_alternative TEXT,
    timestamp TEXT NOT NULL,
    UNIQUE(session_id, vendor_canonical_id, rejection_reason)
  )`,

  // Prompts: all LLM prompts stored in the DB for easy editing without deploys
  `CREATE TABLE IF NOT EXISTS prompts (
    id              TEXT PRIMARY KEY,
    kind            TEXT NOT NULL,
    category        TEXT,
    template        TEXT,
    text            TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_prompts_kind ON prompts(kind)`,
  `CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category)`,
  `CREATE INDEX IF NOT EXISTS idx_prompts_active ON prompts(is_active) WHERE is_active = TRUE`,

  // Fast benchmark: direct API probe responses (not full transcripts)
  `CREATE TABLE IF NOT EXISTS fast_benchmark_responses (
    id SERIAL PRIMARY KEY,
    job_id TEXT NOT NULL,
    prompt_id TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    category TEXT NOT NULL,
    response_text TEXT,
    duration_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    vendor_mentions JSONB NOT NULL DEFAULT '[]',
    primary_vendor TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(job_id, prompt_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fast_bench_job ON fast_benchmark_responses(job_id)`,

  // Seed the uncategorized category for auto-discovered vendors
  `INSERT INTO categories (id, display_name, description, icon)
   VALUES ('uncategorized', 'Uncategorized', 'Auto-discovered vendors not yet categorized', '❓')
   ON CONFLICT(id) DO NOTHING`,
];

export class ObservatoryDB {
  private pool: Pool;
  private _txnClient: PoolClient | null = null;

  /** Routes queries through the active transaction client when inside runInTransaction, otherwise through the pool. */
  private get queryable(): Pool | PoolClient {
    return this._txnClient ?? this.pool;
  }

  private constructor(pool: Pool) {
    this.pool = pool;
  }

  /** Expose pool for prompt-store and LLM enrichment queries. */
  getPool(): Pool {
    return this.pool;
  }

  static async create(connectionString: string): Promise<ObservatoryDB> {
    const pool = new Pool({ connectionString });
    const instance = new ObservatoryDB(pool);
    await instance.init();
    return instance;
  }

  private async init(): Promise<void> {
    for (const stmt of SCHEMA_STATEMENTS) {
      await this.queryable.query(stmt);
    }
    await this.migrate();
  }

  private async migrate(): Promise<void> {
    // Add is_benchmark column if missing
    const { rows: sessionCols } = await this.queryable.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions' AND table_schema = 'public'`
    );
    const sessionColNames = new Set(sessionCols.map((c: { column_name: string }) => c.column_name));
    if (!sessionColNames.has("is_benchmark")) {
      await this.queryable.query("ALTER TABLE sessions ADD COLUMN is_benchmark BOOLEAN NOT NULL DEFAULT FALSE");
    }

    // Add LLM enrichment columns to response_context if missing
    const { rows: rcCols } = await this.queryable.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'response_context' AND table_schema = 'public'`
    );
    const rcColNames = new Set(rcCols.map((c: { column_name: string }) => c.column_name));
    if (!rcColNames.has("reasoning_chain")) {
      await this.queryable.query("ALTER TABLE response_context ADD COLUMN reasoning_chain TEXT");
    }
    if (!rcColNames.has("disqualification_reasons")) {
      await this.queryable.query("ALTER TABLE response_context ADD COLUMN disqualification_reasons TEXT");
    }
    if (!rcColNames.has("confidence_score")) {
      await this.queryable.query("ALTER TABLE response_context ADD COLUMN confidence_score REAL");
    }
    if (!rcColNames.has("is_custom_diy")) {
      await this.queryable.query("ALTER TABLE response_context ADD COLUMN is_custom_diy BOOLEAN NOT NULL DEFAULT FALSE");
    }
  }

  async getIngestedFile(filePath: string): Promise<IngestedFileRow | null> {
    const { rows } = await this.queryable.query("SELECT * FROM ingested_files WHERE file_path = $1", [filePath]);
    return (rows[0] as IngestedFileRow) ?? null;
  }

  async upsertIngestedFile(filePath: string, fileSize: number, fileMtime: string, sourcePlatform: string, sessionCount: number): Promise<void> {
    await this.queryable.query(`
      INSERT INTO ingested_files (file_path, file_size, file_mtime, source_platform, ingested_at, session_count)
      VALUES ($1, $2, $3, $4, NOW()::text, $5)
      ON CONFLICT(file_path) DO UPDATE SET file_size = EXCLUDED.file_size, file_mtime = EXCLUDED.file_mtime,
        ingested_at = NOW()::text, session_count = EXCLUDED.session_count
    `, [filePath, fileSize, fileMtime, sourcePlatform, sessionCount]);
  }

  async needsReingestion(filePath: string, fileSize: number, fileMtime: string): Promise<boolean> {
    const existing = await this.getIngestedFile(filePath);
    if (!existing) return true;
    return existing.file_size !== fileSize || existing.file_mtime !== fileMtime;
  }

  async upsertSession(session: { id: string; sourcePlatform: string; modelId: string | null; startedAt: string; endedAt: string | null; cwd: string | null; gitBranch: string | null; turnCount: number; filePath: string; }): Promise<void> {
    const isBenchmark = !!((session.cwd && session.cwd.includes("obs-bench")) || session.gitBranch === "__obs_bench__");
    await this.queryable.query(`
      INSERT INTO sessions (id, source_platform, model_id, started_at, ended_at, cwd, git_branch, turn_count, file_path, is_benchmark)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT(id) DO UPDATE SET model_id = EXCLUDED.model_id, started_at = EXCLUDED.started_at, ended_at = EXCLUDED.ended_at,
        cwd = EXCLUDED.cwd, git_branch = EXCLUDED.git_branch, turn_count = EXCLUDED.turn_count, file_path = EXCLUDED.file_path, is_benchmark = EXCLUDED.is_benchmark
    `, [session.id, session.sourcePlatform, session.modelId, session.startedAt, session.endedAt, session.cwd, session.gitBranch, session.turnCount, session.filePath, isBenchmark]);
  }

  async deleteSessionsByFilePath(filePath: string): Promise<void> {
    const { rows: sessions } = await this.queryable.query("SELECT id FROM sessions WHERE file_path = $1", [filePath]);
    for (const s of sessions as { id: string }[]) {
      await this.queryable.query("DELETE FROM tool_actions WHERE session_id = $1", [s.id]);
      await this.queryable.query("DELETE FROM observations WHERE session_id = $1", [s.id]);
      await this.queryable.query("DELETE FROM vendor_rejections WHERE session_id = $1", [s.id]);
    }
    await this.queryable.query("DELETE FROM sessions WHERE file_path = $1", [filePath]);
  }

  async insertObservation(sessionId: string, mention: VendorMention): Promise<void> {
    await this.queryable.query(`
      INSERT INTO observations
        (session_id, vendor_canonical_id, vendor_raw, mention_type, work_category, confidence, context_snippet, user_prompt_snippet, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT DO NOTHING
    `, [sessionId, mention.vendorCanonicalId, mention.vendorRaw, mention.mentionType, mention.workCategory, mention.confidence, mention.contextSnippet, mention.userPromptSnippet, mention.timestamp]);
  }

  async insertVendorRejection(sessionId: string, rejection: VendorRejection): Promise<void> {
    await this.queryable.query(`
      INSERT INTO vendor_rejections
        (session_id, vendor_canonical_id, rejection_reason, rejection_reason_detail, chosen_alternative, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
    `, [sessionId, rejection.vendorCanonicalId, rejection.rejectionReason, rejection.rejectionReasonDetail, rejection.chosenAlternative, rejection.timestamp]);
  }

  async getRejectionsBySessionId(sessionId: string): Promise<VendorRejectionRow[]> {
    const { rows } = await this.queryable.query("SELECT * FROM vendor_rejections WHERE session_id = $1 ORDER BY timestamp", [sessionId]);
    return rows as VendorRejectionRow[];
  }

  async insertToolAction(sessionId: string, toolName: string, commandOrPath: string | null, vendorCanonicalId: string | null, actionType: string | null, success: number | null, timestamp: string): Promise<void> {
    await this.queryable.query(`
      INSERT INTO tool_actions (session_id, tool_name, command_or_path, vendor_canonical_id, action_type, success, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [sessionId, toolName, commandOrPath, vendorCanonicalId, actionType, success, timestamp]);
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    this._txnClient = client;
    try {
      await client.query("BEGIN");
      const result = await fn();
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      this._txnClient = null;
      client.release();
    }
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const sessions = (await this.queryable.query("SELECT COUNT(*) AS c FROM sessions")).rows[0] as { c: string };
    const observations = (await this.queryable.query("SELECT COUNT(*) AS c FROM observations")).rows[0] as { c: string };
    const vendors = (await this.queryable.query("SELECT COUNT(DISTINCT vendor_canonical_id) AS c FROM observations")).rows[0] as { c: string };
    const { rows: platforms } = await this.queryable.query("SELECT source_platform, COUNT(*) AS c FROM sessions GROUP BY source_platform");
    const lastIngested = (await this.queryable.query("SELECT MAX(ingested_at) AS t FROM ingested_files")).rows[0] as { t: string | null };
    const platformBreakdown: Record<string, number> = {};
    for (const p of platforms as Array<{ source_platform: string; c: string }>) { platformBreakdown[p.source_platform] = Number(p.c); }
    return { totalSessions: Number(sessions.c), totalObservations: Number(observations.c), uniqueVendors: Number(vendors.c), platformBreakdown, lastIngestedAt: lastIngested.t };
  }

  async getVendorStats(filters?: { platform?: string; mentionType?: string; workCategory?: string; }): Promise<VendorStats[]> {
    let whereClause = "1=1";
    const params: string[] = [];
    let paramIdx = 1;
    if (filters?.platform) { whereClause += ` AND s.source_platform = $${paramIdx++}`; params.push(filters.platform); }
    if (filters?.mentionType) { whereClause += ` AND o.mention_type = $${paramIdx++}`; params.push(filters.mentionType); }
    if (filters?.workCategory) { whereClause += ` AND o.work_category = $${paramIdx++}`; params.push(filters.workCategory); }
    const { rows } = await this.queryable.query(`
      SELECT o.vendor_canonical_id, o.work_category AS category, COUNT(*) AS total,
        SUM(CASE WHEN o.mention_type = 'installed' THEN 1 ELSE 0 END) AS installed,
        SUM(CASE WHEN o.mention_type = 'configured' THEN 1 ELSE 0 END) AS configured,
        SUM(CASE WHEN o.mention_type = 'implemented' THEN 1 ELSE 0 END) AS implemented,
        SUM(CASE WHEN o.mention_type = 'recommended' THEN 1 ELSE 0 END) AS recommended,
        SUM(CASE WHEN o.mention_type = 'compared' THEN 1 ELSE 0 END) AS compared,
        SUM(CASE WHEN o.mention_type = 'mentioned' THEN 1 ELSE 0 END) AS mentioned,
        SUM(CASE WHEN o.mention_type = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN o.mention_type = 'custom_diy' THEN 1 ELSE 0 END) AS custom_diy,
        string_agg(DISTINCT s.source_platform, ',') AS platforms
      FROM observations o JOIN sessions s ON o.session_id = s.id WHERE ${whereClause}
      GROUP BY o.vendor_canonical_id, o.work_category ORDER BY total DESC
    `, params);
    return rows.map((r: Record<string, unknown>) => ({
      vendor_canonical_id: r.vendor_canonical_id as string, display_name: r.vendor_canonical_id as string,
      category: (r.category as string) || "other", total: Number(r.total), installed: Number(r.installed),
      configured: Number(r.configured), implemented: Number(r.implemented), recommended: Number(r.recommended),
      compared: Number(r.compared), mentioned: Number(r.mentioned), rejected: Number(r.rejected),
      custom_diy: Number(r.custom_diy), platforms: (r.platforms as string) || "",
    }));
  }

  async getPlatformComparison(): Promise<PlatformStats[]> {
    const { rows } = await this.queryable.query(`
      SELECT o.vendor_canonical_id,
        SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) AS claude_code_count,
        SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END) AS codex_cli_count
      FROM observations o JOIN sessions s ON o.session_id = s.id GROUP BY o.vendor_canonical_id
      ORDER BY (SUM(CASE WHEN s.source_platform = 'claude_code' THEN 1 ELSE 0 END) + SUM(CASE WHEN s.source_platform = 'codex_cli' THEN 1 ELSE 0 END)) DESC
    `);
    return rows.map((r: Record<string, unknown>) => {
      const cc = Number(r.claude_code_count); const cx = Number(r.codex_cli_count);
      return { vendor_canonical_id: r.vendor_canonical_id as string, display_name: r.vendor_canonical_id as string,
        claude_code_count: cc, codex_cli_count: cx, delta: Math.abs(cc - cx) };
    });
  }

  async getCoOccurrences(minCount = 2): Promise<CoOccurrence[]> {
    const { rows } = await this.queryable.query(`
      SELECT a.vendor_canonical_id AS vendor_a, b.vendor_canonical_id AS vendor_b,
        COUNT(DISTINCT a.session_id) AS co_occurrence_count, string_agg(DISTINCT a.session_id, ',') AS sessions
      FROM observations a JOIN observations b ON a.session_id = b.session_id
      WHERE a.vendor_canonical_id < b.vendor_canonical_id
      GROUP BY a.vendor_canonical_id, b.vendor_canonical_id HAVING COUNT(DISTINCT a.session_id) >= $1
      ORDER BY co_occurrence_count DESC LIMIT 100
    `, [minCount]);
    return rows.map((r: Record<string, unknown>) => ({ vendor_a: r.vendor_a as string, vendor_b: r.vendor_b as string,
      co_occurrence_count: Number(r.co_occurrence_count), sessions: (r.sessions as string) || "" }));
  }

  async getTimeline(): Promise<TimelinePoint[]> {
    const { rows } = await this.queryable.query(`
      SELECT to_char(o.timestamp::timestamptz, 'IYYY-"W"IW') AS week, o.vendor_canonical_id, COUNT(*) AS count
      FROM observations o GROUP BY week, o.vendor_canonical_id ORDER BY week, count DESC
    `);
    return rows.map((r: Record<string, unknown>) => ({ week: r.week as string, vendor_canonical_id: r.vendor_canonical_id as string, count: Number(r.count) }));
  }

  async getActionFunnels(): Promise<FunnelStats[]> {
    const { rows } = await this.queryable.query(`
      SELECT vendor_canonical_id,
        SUM(CASE WHEN mention_type = 'mentioned' THEN 1 ELSE 0 END) AS mentioned_total,
        SUM(CASE WHEN mention_type = 'recommended' THEN 1 ELSE 0 END) AS recommended_total,
        SUM(CASE WHEN mention_type = 'installed' THEN 1 ELSE 0 END) AS installed_total
      FROM observations GROUP BY vendor_canonical_id
      HAVING (SUM(CASE WHEN mention_type = 'recommended' THEN 1 ELSE 0 END) + SUM(CASE WHEN mention_type = 'installed' THEN 1 ELSE 0 END)) > 0
      ORDER BY SUM(CASE WHEN mention_type = 'installed' THEN 1 ELSE 0 END) DESC, SUM(CASE WHEN mention_type = 'recommended' THEN 1 ELSE 0 END) DESC
    `);
    return rows.map((r: Record<string, unknown>) => {
      const rec = Number(r.recommended_total); const inst = Number(r.installed_total);
      return { vendor_canonical_id: r.vendor_canonical_id as string, display_name: r.vendor_canonical_id as string,
        mentioned_total: Number(r.mentioned_total), recommended_total: rec, installed_total: inst,
        conversion_rate: rec > 0 ? inst / rec : 0 };
    });
  }

  async getSessions(limit = 50, offset = 0, platform?: string): Promise<SessionRow[]> {
    let sql = "SELECT * FROM sessions";
    const params: (string | number)[] = [];
    let paramIdx = 1;
    if (platform) { sql += ` WHERE source_platform = $${paramIdx++}`; params.push(platform); }
    sql += ` ORDER BY started_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);
    const { rows } = await this.queryable.query(sql, params);
    return rows as SessionRow[];
  }

  async getSessionById(id: string): Promise<SessionRow | null> {
    const { rows } = await this.queryable.query("SELECT * FROM sessions WHERE id = $1", [id]);
    return (rows[0] as SessionRow) ?? null;
  }

  async getObservationsBySessionId(sessionId: string): Promise<ObservationRow[]> {
    const { rows } = await this.queryable.query("SELECT * FROM observations WHERE session_id = $1 ORDER BY timestamp", [sessionId]);
    return rows as ObservationRow[];
  }

  async getToolActionsBySessionId(sessionId: string): Promise<ToolActionRow[]> {
    const { rows } = await this.queryable.query("SELECT * FROM tool_actions WHERE session_id = $1 ORDER BY timestamp", [sessionId]);
    return rows as ToolActionRow[];
  }

  // ── Prompt Metadata ──────────────────────────────────────────────

  async upsertPromptMetadata(meta: {
    promptId: string;
    category: string;
    contentTags: string[];
    patternTags: string[];
    constraints: string[];
    existingStack: string[];
    failureMode: string | null;
    vendorsNamedInPrompt: string[];
  }): Promise<void> {
    await this.queryable.query(`
      INSERT INTO prompt_metadata (prompt_id, category, content_tags, pattern_tags, constraints, existing_stack, failure_mode, vendors_named_in_prompt)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT(prompt_id) DO UPDATE SET
        category = EXCLUDED.category,
        content_tags = EXCLUDED.content_tags,
        pattern_tags = EXCLUDED.pattern_tags,
        constraints = EXCLUDED.constraints,
        existing_stack = EXCLUDED.existing_stack,
        failure_mode = EXCLUDED.failure_mode,
        vendors_named_in_prompt = EXCLUDED.vendors_named_in_prompt
    `, [
      meta.promptId,
      meta.category,
      JSON.stringify(meta.contentTags),
      JSON.stringify(meta.patternTags),
      JSON.stringify(meta.constraints),
      JSON.stringify(meta.existingStack),
      meta.failureMode,
      JSON.stringify(meta.vendorsNamedInPrompt),
    ]);
  }

  async getPromptMetadata(promptId: string): Promise<PromptMetadataRow | null> {
    const { rows } = await this.queryable.query("SELECT * FROM prompt_metadata WHERE prompt_id = $1", [promptId]);
    return (rows[0] as PromptMetadataRow) ?? null;
  }

  async getAllPromptMetadata(): Promise<PromptMetadataRow[]> {
    const { rows } = await this.queryable.query("SELECT * FROM prompt_metadata ORDER BY prompt_id");
    return rows as PromptMetadataRow[];
  }

  // ── Response Context ──────────────────────────────────────────────

  async upsertResponseContext(ctx: {
    sessionId: string;
    promptId: string;
    primaryVendor: string | null;
    isImplemented: boolean;
    isCustomDiy?: boolean;
    rationaleSnippet: string | null;
    vendorsMentioned: Array<{ vendor: string; disposition: string }>;
    tradeOffsSnippet: string | null;
    gotchasSnippet: string | null;
    constraintsAddressed: string[];
    reasoningChain?: string | null;
    disqualificationReasons?: DisqualificationReason[];
    confidenceScore?: number | null;
  }): Promise<void> {
    await this.queryable.query(`
      INSERT INTO response_context (session_id, prompt_id, primary_vendor, is_implemented, is_custom_diy,
        rationale_snippet, vendors_mentioned, trade_offs_snippet, gotchas_snippet, constraints_addressed,
        reasoning_chain, disqualification_reasons, confidence_score, extracted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()::text)
      ON CONFLICT(session_id, prompt_id) DO UPDATE SET
        primary_vendor = EXCLUDED.primary_vendor,
        is_implemented = EXCLUDED.is_implemented,
        is_custom_diy = EXCLUDED.is_custom_diy,
        rationale_snippet = EXCLUDED.rationale_snippet,
        vendors_mentioned = EXCLUDED.vendors_mentioned,
        trade_offs_snippet = EXCLUDED.trade_offs_snippet,
        gotchas_snippet = EXCLUDED.gotchas_snippet,
        constraints_addressed = EXCLUDED.constraints_addressed,
        reasoning_chain = EXCLUDED.reasoning_chain,
        disqualification_reasons = EXCLUDED.disqualification_reasons,
        confidence_score = EXCLUDED.confidence_score,
        extracted_at = NOW()::text
    `, [
      ctx.sessionId,
      ctx.promptId,
      ctx.primaryVendor,
      ctx.isImplemented,
      ctx.isCustomDiy ?? false,
      ctx.rationaleSnippet,
      JSON.stringify(ctx.vendorsMentioned),
      ctx.tradeOffsSnippet,
      ctx.gotchasSnippet,
      JSON.stringify(ctx.constraintsAddressed),
      ctx.reasoningChain ?? null,
      ctx.disqualificationReasons ? JSON.stringify(ctx.disqualificationReasons) : null,
      ctx.confidenceScore ?? null,
    ]);
  }

  // ── Prompt Intents ──────────────────────────────────────────────

  async upsertPromptIntent(ctx: {
    sessionId: string;
    promptId: string;
    intent: IntentClassification;
  }): Promise<void> {
    await this.queryable.query(`
      INSERT INTO prompt_intents (session_id, prompt_id, intent, confidence, sub_intent, classifier, classified_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW()::text)
      ON CONFLICT(session_id, prompt_id) DO UPDATE SET
        intent = EXCLUDED.intent,
        confidence = EXCLUDED.confidence,
        sub_intent = EXCLUDED.sub_intent,
        classifier = EXCLUDED.classifier,
        classified_at = NOW()::text
    `, [
      ctx.sessionId,
      ctx.promptId,
      ctx.intent.intent,
      ctx.intent.confidence,
      ctx.intent.subIntent,
      ctx.intent.classifier,
    ]);
  }

  async getResponseContextBySession(sessionId: string): Promise<ResponseContextRow[]> {
    const { rows } = await this.queryable.query("SELECT * FROM response_context WHERE session_id = $1", [sessionId]);
    return rows as ResponseContextRow[];
  }

  async getResponseContextByPrompt(promptId: string): Promise<ResponseContextRow[]> {
    const { rows } = await this.queryable.query("SELECT * FROM response_context WHERE prompt_id = $1 ORDER BY extracted_at DESC", [promptId]);
    return rows as ResponseContextRow[];
  }

  // ── Enrichment Queries ────────────────────────────────────────────

  async getPrimaryVendorCounts(filters?: { promptId?: string; category?: string; platform?: string }): Promise<Array<{ primary_vendor: string; count: number }>> {
    let where = "rc.primary_vendor IS NOT NULL";
    const params: string[] = [];
    let paramIdx = 1;
    if (filters?.promptId) { where += ` AND rc.prompt_id = $${paramIdx++}`; params.push(filters.promptId); }
    if (filters?.category) { where += ` AND pm.category = $${paramIdx++}`; params.push(filters.category); }
    if (filters?.platform) { where += ` AND s.source_platform = $${paramIdx++}`; params.push(filters.platform); }
    const { rows } = await this.queryable.query(`
      SELECT rc.primary_vendor, COUNT(*) AS count
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
      WHERE ${where}
      GROUP BY rc.primary_vendor ORDER BY count DESC
    `, params);
    return rows.map((r: Record<string, unknown>) => ({ primary_vendor: r.primary_vendor as string, count: Number(r.count) }));
  }

  async getConstraintCoverage(promptId: string): Promise<Array<{ session_id: string; source_platform: string; constraints_addressed: string }>> {
    const { rows } = await this.queryable.query(`
      SELECT rc.session_id, s.source_platform, rc.constraints_addressed
      FROM response_context rc JOIN sessions s ON rc.session_id = s.id
      WHERE rc.prompt_id = $1
    `, [promptId]);
    return rows as Array<{ session_id: string; source_platform: string; constraints_addressed: string }>;
  }

  // ── FTS Search Index ────────────────────────────────────────────

  async populateSearchIndex(entries: Array<{
    sourceType: string;
    sourceId: string;
    vendor: string;
    category: string;
    platform: string;
    promptId: string;
    textContent: string;
  }>): Promise<void> {
    for (const entry of entries) {
      if (!entry.textContent || entry.textContent.trim().length < 10) continue;
      await this.queryable.query("DELETE FROM search_index WHERE source_id = $1", [entry.sourceId]);
      await this.queryable.query(`
        INSERT INTO search_index (source_type, source_id, vendor, category, platform, prompt_id, text_content)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        entry.sourceType,
        entry.sourceId,
        entry.vendor,
        entry.category,
        entry.platform,
        entry.promptId,
        entry.textContent,
      ]);
    }
  }

  // ── Cross-Session Insights ─────────────────────────────────────────

  async upsertInsight(type: string, promptId: string | null, data: unknown): Promise<void> {
    if (promptId) {
      await this.queryable.query(
        "DELETE FROM cross_session_insights WHERE insight_type = $1 AND prompt_id = $2",
        [type, promptId],
      );
    } else {
      await this.queryable.query(
        "DELETE FROM cross_session_insights WHERE insight_type = $1 AND prompt_id IS NULL",
        [type],
      );
    }
    await this.queryable.query(`
      INSERT INTO cross_session_insights (insight_type, prompt_id, insight_data, generated_at)
      VALUES ($1, $2, $3, NOW()::text)
    `, [type, promptId, JSON.stringify(data)]);
  }

  async getInsightsByType(type: string): Promise<Array<{ id: number; insight_type: string; prompt_id: string | null; insight_data: string; generated_at: string }>> {
    const { rows } = await this.queryable.query(
      "SELECT * FROM cross_session_insights WHERE insight_type = $1 ORDER BY generated_at DESC",
      [type],
    );
    return rows as Array<{ id: number; insight_type: string; prompt_id: string | null; insight_data: string; generated_at: string }>;
  }

  // ── Analysis Snapshots ────────────────────────────────────────────

  async upsertSnapshot(snapshotDate: string, promptId: string, platform: string, primaryVendor: string | null, constraintsAddressed: string[]): Promise<void> {
    await this.queryable.query(`
      INSERT INTO analysis_snapshots (snapshot_date, prompt_id, platform, primary_vendor, constraints_addressed)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(snapshot_date, prompt_id, platform) DO UPDATE SET
        primary_vendor = EXCLUDED.primary_vendor,
        constraints_addressed = EXCLUDED.constraints_addressed
    `, [snapshotDate, promptId, platform, primaryVendor, JSON.stringify(constraintsAddressed)]);
  }

  async getSnapshot(date: string): Promise<Array<{ prompt_id: string; platform: string; primary_vendor: string | null; constraints_addressed: string }>> {
    const { rows } = await this.queryable.query(
      "SELECT prompt_id, platform, primary_vendor, constraints_addressed FROM analysis_snapshots WHERE snapshot_date = $1",
      [date],
    );
    return rows as Array<{ prompt_id: string; platform: string; primary_vendor: string | null; constraints_addressed: string }>;
  }

  async getPreviousSnapshotDate(beforeDate: string): Promise<string | null> {
    const { rows } = await this.queryable.query(
      "SELECT DISTINCT snapshot_date FROM analysis_snapshots WHERE snapshot_date < $1 ORDER BY snapshot_date DESC LIMIT 1",
      [beforeDate],
    );
    return rows[0]?.snapshot_date ?? null;
  }

  // ── Daily Digests ─────────────────────────────────────────────────

  async upsertDailyDigest(runDate: string, summary: string | null, significantChanges: unknown, alerts: unknown): Promise<void> {
    await this.queryable.query(`
      INSERT INTO daily_digests (run_date, summary, significant_changes, alerts, generated_at)
      VALUES ($1, $2, $3, $4, NOW()::text)
      ON CONFLICT(run_date) DO UPDATE SET
        summary = EXCLUDED.summary,
        significant_changes = EXCLUDED.significant_changes,
        alerts = EXCLUDED.alerts,
        generated_at = NOW()::text
    `, [runDate, summary, JSON.stringify(significantChanges), JSON.stringify(alerts)]);
  }

  async getLatestDigests(limit = 10): Promise<Array<{ run_date: string; summary: string | null; significant_changes: string; alerts: string; generated_at: string }>> {
    const { rows } = await this.queryable.query(
      "SELECT * FROM daily_digests ORDER BY run_date DESC LIMIT $1",
      [limit],
    );
    return rows as Array<{ run_date: string; summary: string | null; significant_changes: string; alerts: string; generated_at: string }>;
  }

  // ── All Response Contexts (for analyzer) ──────────────────────────

  async getAllResponseContexts(): Promise<Array<{
    session_id: string;
    prompt_id: string;
    primary_vendor: string | null;
    vendors_mentioned: string;
    constraints_addressed: string;
    is_implemented: boolean;
    rationale_snippet: string | null;
    trade_offs_snippet: string | null;
    gotchas_snippet: string | null;
    extracted_at: string;
    source_platform: string;
    category: string | null;
  }>> {
    const { rows } = await this.queryable.query(`
      SELECT rc.*, s.source_platform, pm.category
      FROM response_context rc
      JOIN sessions s ON rc.session_id = s.id
      LEFT JOIN prompt_metadata pm ON rc.prompt_id = pm.prompt_id
    `);
    return rows as Array<{
      session_id: string; prompt_id: string; primary_vendor: string | null;
      vendors_mentioned: string; constraints_addressed: string; is_implemented: boolean;
      rationale_snippet: string | null; trade_offs_snippet: string | null;
      gotchas_snippet: string | null; extracted_at: string; source_platform: string;
      category: string | null;
    }>;
  }

  // ── Vendors (taxonomy in DB) ──────────────────────────────────────

  async getVendorsAsTaxonomy(): Promise<{ vendors: Array<{ canonical_id: string; display_name: string; synonyms: string[]; category: string }> }> {
    const { rows } = await this.queryable.query(
      "SELECT canonical_id, display_name, category, synonyms FROM vendors ORDER BY canonical_id"
    );
    return {
      vendors: rows.map((r: Record<string, unknown>) => ({
        canonical_id: r.canonical_id as string,
        display_name: r.display_name as string,
        category: r.category as string,
        synonyms: (r.synonyms as string[]) ?? [],
      })),
    };
  }

  async getVendorById(canonicalId: string): Promise<{ canonical_id: string; display_name: string; category: string; synonyms: string[]; package_names: string[]; is_dynamic: boolean } | null> {
    const { rows } = await this.queryable.query(
      "SELECT canonical_id, display_name, category, synonyms, package_names, is_dynamic FROM vendors WHERE canonical_id = $1",
      [canonicalId]
    );
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      canonical_id: r.canonical_id as string,
      display_name: r.display_name as string,
      category: r.category as string,
      synonyms: (r.synonyms as string[]) ?? [],
      package_names: (r.package_names as string[]) ?? [],
      is_dynamic: r.is_dynamic as boolean,
    };
  }

  async findVendorByDomainOrName(domain: string, productName: string): Promise<string | null> {
    // Check canonical_id matches domain
    const { rows: byId } = await this.queryable.query(
      "SELECT canonical_id FROM vendors WHERE canonical_id = $1 OR canonical_id = $2",
      [domain.split(".")[0], `unknown/${domain}`]
    );
    if (byId.length > 0) return (byId[0] as { canonical_id: string }).canonical_id;

    // Check display_name
    const { rows: byName } = await this.queryable.query(
      "SELECT canonical_id FROM vendors WHERE LOWER(display_name) = LOWER($1)",
      [productName]
    );
    if (byName.length > 0) return (byName[0] as { canonical_id: string }).canonical_id;

    // Check synonyms array contains the domain or product name
    const { rows: bySyn } = await this.queryable.query(
      "SELECT canonical_id FROM vendors WHERE $1 = ANY(synonyms) OR $2 = ANY(synonyms) LIMIT 1",
      [domain.split(".")[0].toLowerCase(), productName.toLowerCase()]
    );
    if (bySyn.length > 0) return (bySyn[0] as { canonical_id: string }).canonical_id;

    return null;
  }

  async upsertVendor(vendor: {
    canonicalId: string;
    displayName: string;
    category: string;
    synonyms: string[];
    packageNames?: string[];
    isDynamic: boolean;
  }): Promise<void> {
    // Ensure the category exists in the categories table before inserting the vendor.
    // This resolves the category dynamically: reuses an existing one if it matches,
    // or creates a new one if no suitable category exists.
    const resolvedCategory = await this.resolveCategory(vendor.category, {
      displayName: vendor.category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      description: "",
      icon: "📦",
    });

    await this.queryable.query(`
      INSERT INTO vendors (canonical_id, display_name, category, synonyms, package_names, is_dynamic)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(canonical_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        category = EXCLUDED.category,
        synonyms = EXCLUDED.synonyms,
        package_names = EXCLUDED.package_names
    `, [vendor.canonicalId, vendor.displayName, resolvedCategory, vendor.synonyms, vendor.packageNames ?? [], vendor.isDynamic]);
  }

  // ── Categories ───────────────────────────────────────────────────

  async getAllCategories(): Promise<Array<{ id: string; display_name: string; description: string; icon: string }>> {
    const { rows } = await this.queryable.query(
      "SELECT id, display_name, description, icon FROM categories ORDER BY id"
    );
    return rows as Array<{ id: string; display_name: string; description: string; icon: string }>;
  }

  async getCategoryById(id: string): Promise<{ id: string; display_name: string; description: string; icon: string } | null> {
    const { rows } = await this.queryable.query(
      "SELECT id, display_name, description, icon FROM categories WHERE id = $1",
      [id]
    );
    return (rows[0] as { id: string; display_name: string; description: string; icon: string }) ?? null;
  }

  async upsertCategory(category: {
    id: string;
    displayName: string;
    description: string;
    icon: string;
  }): Promise<void> {
    await this.queryable.query(`
      INSERT INTO categories (id, display_name, description, icon)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon
    `, [category.id, category.displayName, category.description, category.icon]);
  }

  /**
   * Given a proposed category slug, check if it already exists in the DB.
   * If it does, return it. If not, create a new category row and return it.
   */
  async resolveCategory(
    categoryId: string,
    fallback: { displayName: string; description: string; icon: string },
  ): Promise<string> {
    const existing = await this.getCategoryById(categoryId);
    if (existing) return existing.id;

    // Check if any existing category is a close match (prefix/substring)
    const allCats = await this.getAllCategories();
    for (const cat of allCats) {
      // Exact match on display name (case-insensitive)
      if (cat.display_name.toLowerCase() === fallback.displayName.toLowerCase()) {
        return cat.id;
      }
    }

    // No suitable existing category — create a new one
    await this.upsertCategory({
      id: categoryId,
      displayName: fallback.displayName,
      description: fallback.description,
      icon: fallback.icon,
    });
    return categoryId;
  }

  /**
   * Seed categories from vendor taxonomy entries.
   * Extracts distinct categories from the vendor list and ensures they exist in the categories table.
   */
  async seedCategoriesFromTaxonomy(vendors: Array<{ category: string }>, categoryMeta?: Record<string, { displayName: string; description: string; icon: string }>): Promise<void> {
    const seen = new Set<string>();
    for (const v of vendors) {
      if (seen.has(v.category)) continue;
      seen.add(v.category);

      const meta = categoryMeta?.[v.category];
      await this.upsertCategory({
        id: v.category,
        displayName: meta?.displayName ?? v.category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        description: meta?.description ?? "",
        icon: meta?.icon ?? "📦",
      });
    }
  }

  // ── Prompts ──────────────────────────────────────────────────────

  async getPromptsByKind(kind: string, activeOnly = true): Promise<Array<{
    id: string; kind: string; category: string | null; template: string | null;
    text: string; metadata: Record<string, unknown>; is_active: boolean;
    version: number;
  }>> {
    const sql = activeOnly
      ? "SELECT id, kind, category, template, text, metadata, is_active, version FROM prompts WHERE kind = $1 AND is_active = TRUE ORDER BY id"
      : "SELECT id, kind, category, template, text, metadata, is_active, version FROM prompts WHERE kind = $1 ORDER BY id";
    const { rows } = await this.queryable.query(sql, [kind]);
    return rows as Array<{
      id: string; kind: string; category: string | null; template: string | null;
      text: string; metadata: Record<string, unknown>; is_active: boolean;
      version: number;
    }>;
  }

  async getPromptById(id: string): Promise<{
    id: string; kind: string; category: string | null; template: string | null;
    text: string; metadata: Record<string, unknown>; is_active: boolean;
    version: number;
  } | null> {
    const { rows } = await this.queryable.query(
      "SELECT id, kind, category, template, text, metadata, is_active, version FROM prompts WHERE id = $1",
      [id],
    );
    return (rows[0] as {
      id: string; kind: string; category: string | null; template: string | null;
      text: string; metadata: Record<string, unknown>; is_active: boolean;
      version: number;
    }) ?? null;
  }

  async upsertPrompt(prompt: {
    id: string; kind: string; category?: string | null; template?: string | null;
    text: string; metadata?: Record<string, unknown>; isActive?: boolean;
    version?: number;
  }): Promise<void> {
    await this.queryable.query(`
      INSERT INTO prompts (id, kind, category, template, text, metadata, is_active, version, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT(id) DO UPDATE SET
        kind = EXCLUDED.kind,
        category = EXCLUDED.category,
        template = EXCLUDED.template,
        text = EXCLUDED.text,
        metadata = EXCLUDED.metadata,
        is_active = EXCLUDED.is_active,
        version = EXCLUDED.version,
        updated_at = NOW()
    `, [
      prompt.id,
      prompt.kind,
      prompt.category ?? null,
      prompt.template ?? null,
      prompt.text,
      JSON.stringify(prompt.metadata ?? {}),
      prompt.isActive ?? true,
      prompt.version ?? 1,
    ]);
  }

  async listPrompts(opts?: {
    kind?: string;
    category?: string;
    includeInactive?: boolean;
  }): Promise<Array<{
    id: string; kind: string; category: string | null; template: string | null;
    text: string; metadata: Record<string, unknown>; is_active: boolean;
    version: number; created_at: string; updated_at: string;
  }>> {
    const conditions: string[] = [];
    const params: string[] = [];
    let idx = 1;
    if (opts?.kind) { conditions.push(`kind = $${idx++}`); params.push(opts.kind); }
    if (opts?.category) { conditions.push(`category = $${idx++}`); params.push(opts.category); }
    if (!opts?.includeInactive) { conditions.push("is_active = TRUE"); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.queryable.query(
      `SELECT id, kind, category, template, text, metadata, is_active, version, created_at::text, updated_at::text FROM prompts ${where} ORDER BY kind, category, id`,
      params,
    );
    return rows as Array<{
      id: string; kind: string; category: string | null; template: string | null;
      text: string; metadata: Record<string, unknown>; is_active: boolean;
      version: number; created_at: string; updated_at: string;
    }>;
  }

  async updatePromptFields(id: string, fields: {
    text?: string;
    kind?: string;
    category?: string | null;
    template?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (fields.text !== undefined) { sets.push(`text = $${idx++}`); params.push(fields.text); }
    if (fields.kind !== undefined) { sets.push(`kind = $${idx++}`); params.push(fields.kind); }
    if (fields.category !== undefined) { sets.push(`category = $${idx++}`); params.push(fields.category); }
    if (fields.template !== undefined) { sets.push(`template = $${idx++}`); params.push(fields.template); }
    if (fields.metadata !== undefined) { sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(fields.metadata)); }
    if (sets.length === 0) return false;
    sets.push(`version = version + 1`);
    sets.push(`updated_at = NOW()`);
    params.push(id);
    const { rowCount } = await this.queryable.query(
      `UPDATE prompts SET ${sets.join(", ")} WHERE id = $${idx}`,
      params,
    );
    return (rowCount ?? 0) > 0;
  }

  async deletePrompt(id: string): Promise<boolean> {
    const { rowCount } = await this.queryable.query("DELETE FROM prompts WHERE id = $1", [id]);
    return (rowCount ?? 0) > 0;
  }

  async setPromptActive(id: string, active: boolean): Promise<boolean> {
    const { rowCount } = await this.queryable.query(
      "UPDATE prompts SET is_active = $1, updated_at = NOW() WHERE id = $2",
      [active, id],
    );
    return (rowCount ?? 0) > 0;
  }

  async getPromptsCount(kind?: string): Promise<number> {
    const sql = kind
      ? "SELECT COUNT(*) AS c FROM prompts WHERE kind = $1 AND is_active = TRUE"
      : "SELECT COUNT(*) AS c FROM prompts WHERE is_active = TRUE";
    const params = kind ? [kind] : [];
    const { rows } = await this.queryable.query(sql, params);
    return Number((rows[0] as { c: string }).c);
  }

  async close(): Promise<void> { await this.pool.end(); }
}
