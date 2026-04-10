import { Pool } from "pg";

// ── Types ────────────────────────────────────────────────────────────

export interface OnboardingJob {
  id: string;
  url: string;
  domain: string;
  email: string | null;
  created_at: Date;
}

export interface Competitor {
  name: string;
  domain: string;
  canonicalId?: string;
}

export interface UrlAnalysisData {
  detected_name: string;
  category: string;
  competitors: string[];
}

export interface FastBenchmarkData {
  sessions_analyzed: number;
  mention_rate: number;
  platforms: string[];
  primary_mention_type: string;
}

export interface BalancedBenchmarkData {
  sessions_analyzed: number;
  mention_rate: number;
  platforms: string[];
  ai_readiness_score: number;
  competitor_comparison: Array<{
    name: string;
    mention_rate: number;
    delta: number;
  }>;
  recommendation_count: number;
  top_recommendation: {
    title: string;
    priority: "P1" | "P2" | "P3";
    impact: "HIGH" | "MEDIUM" | "LOW";
    description: string;
  };
}

export interface ComprehensiveBenchmarkData {
  sessions_analyzed: number;
  mention_rate: number;
  platforms: string[];
  ai_readiness_score: number;
  competitor_comparison: Array<{
    name: string;
    mention_rate: number;
    delta: number;
  }>;
  recommendation_count: number;
  top_recommendation: {
    title: string;
    priority: "P1" | "P2" | "P3";
    impact: "HIGH" | "MEDIUM" | "LOW";
    description: string;
  };
  all_recommendations: Array<{
    title: string;
    priority: "P1" | "P2" | "P3";
    impact: "HIGH" | "MEDIUM" | "LOW";
    description: string;
  }>;
  constraint_coverage: Array<{
    constraint: string;
    addressed_rate: number;
  }>;
}

export type StageStatus = "pending" | "running" | "complete";

export interface JobStatus {
  jobId: string;
  url: string;
  domain: string;
  email: string | null;
  stages: {
    url_analysis: { status: StageStatus; data: UrlAnalysisData | null };
    fast: { status: StageStatus; data: FastBenchmarkData | null };
    balanced: { status: StageStatus; data: BalancedBenchmarkData | null };
    comprehensive: { status: StageStatus; data: ComprehensiveBenchmarkData | null };
  };
}

// ── DB Pool (lazy singleton) ────────────────────────────────────────

let _pool: Pool | null = null;
let _poolFailed = false;
let _tablesReady = false;

export function getPool(): Pool | null {
  if (_poolFailed) return null;
  if (_pool) return _pool;
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      _poolFailed = true;
      return null;
    }
    _pool = new Pool({ connectionString });
    return _pool;
  } catch {
    _poolFailed = true;
    return null;
  }
}

async function ensureTables() {
  if (_tablesReady) return;
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS onboarding_jobs (
        id         TEXT PRIMARY KEY,
        url        TEXT NOT NULL,
        domain     TEXT NOT NULL,
        email      TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Migrate: add result columns if missing
    const { rows: cols } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'onboarding_jobs' AND table_schema = 'public'`
    );
    const existing = new Set(cols.map((c: { column_name: string }) => c.column_name));
    const migrations: Array<[string, string]> = [
      // URL analysis results
      ["product_name", "TEXT"],
      ["detected_category", "TEXT"],
      ["competitors", "JSONB"],
      // Fast benchmark results
      ["fast_mention_rate", "FLOAT"],
      ["fast_session_count", "INT"],
      ["fast_platform_coverage", "JSONB"],
      ["fast_competitor_rates", "JSONB"],
      // Balanced benchmark results
      ["balanced_mention_rate", "FLOAT"],
      ["balanced_session_count", "INT"],
      ["balanced_ai_readiness", "INT"],
      ["balanced_platform_coverage", "JSONB"],
      ["balanced_competitor_rates", "JSONB"],
      ["balanced_recommendations", "JSONB"],
      // Comprehensive benchmark results
      ["comprehensive_mention_rate", "FLOAT"],
      ["comprehensive_session_count", "INT"],
      ["comprehensive_ai_readiness", "INT"],
      ["comprehensive_platform_coverage", "JSONB"],
      ["comprehensive_competitor_rates", "JSONB"],
      ["comprehensive_recommendations", "JSONB"],
      ["comprehensive_constraint_coverage", "JSONB"],
      // Stage timestamps
      ["url_analysis_completed_at", "TIMESTAMPTZ"],
      ["fast_completed_at", "TIMESTAMPTZ"],
      ["balanced_completed_at", "TIMESTAMPTZ"],
      ["comprehensive_completed_at", "TIMESTAMPTZ"],
      // Worker lock
      ["worker_claimed_at", "TIMESTAMPTZ"],
      ["worker_id", "TEXT"],
      // Error tracking
      ["error", "TEXT"],
    ];
    for (const [col, type] of migrations) {
      if (!existing.has(col)) {
        await pool.query(`ALTER TABLE onboarding_jobs ADD COLUMN ${col} ${type}`);
      }
    }
    _tablesReady = true;
  } catch (err) {
    console.error("[onboard] Failed to create tables:", err);
  }
}

// ── DB functions ─────────────────────────────────────────────────────

export async function createJob(url: string, domain: string): Promise<string> {
  await ensureTables();
  const id = crypto.randomUUID();
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_URL is required");
  await pool.query(
    "INSERT INTO onboarding_jobs (id, url, domain) VALUES ($1, $2, $3)",
    [id, url, domain],
  );
  return id;
}

export async function findRecentJob(domain: string): Promise<string | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT id FROM onboarding_jobs
     WHERE domain = $1 AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT 1`,
    [domain],
  );
  return rows.length > 0 ? rows[0].id : null;
}

export async function getJob(jobId: string): Promise<OnboardingJob | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    "SELECT id, url, domain, email, created_at FROM onboarding_jobs WHERE id = $1",
    [jobId],
  );
  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    url: rows[0].url,
    domain: rows[0].domain,
    email: rows[0].email,
    created_at: new Date(rows[0].created_at),
  };
}

export async function saveJobEmail(jobId: string, email: string): Promise<void> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    "UPDATE onboarding_jobs SET email = $1 WHERE id = $2",
    [email, jobId],
  );
}

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const pool = getPool();
  if (!pool) return null;

  await ensureTables();
  const { rows } = await pool.query(
    `SELECT id, url, domain, email, created_at,
            product_name, detected_category, competitors,
            fast_mention_rate, fast_session_count, fast_platform_coverage, fast_competitor_rates,
            balanced_mention_rate, balanced_session_count, balanced_ai_readiness,
            balanced_platform_coverage, balanced_competitor_rates, balanced_recommendations,
            comprehensive_mention_rate, comprehensive_session_count, comprehensive_ai_readiness,
            comprehensive_platform_coverage, comprehensive_competitor_rates,
            comprehensive_recommendations, comprehensive_constraint_coverage,
            url_analysis_completed_at, fast_completed_at, balanced_completed_at,
            comprehensive_completed_at,
            worker_claimed_at, error
     FROM onboarding_jobs WHERE id = $1`,
    [jobId]
  );
  if (rows.length === 0) return null;

  const r = rows[0];
  const urlDone = !!r.url_analysis_completed_at;
  const fastDone = !!r.fast_completed_at;
  const balancedDone = !!r.balanced_completed_at;
  const comprehensiveDone = !!r.comprehensive_completed_at;
  const workerClaimed = !!r.worker_claimed_at;

  const urlAnalysisStatus: StageStatus = urlDone ? "complete" : workerClaimed ? "running" : "pending";
  const fastStatus: StageStatus = fastDone ? "complete" : (urlDone && workerClaimed) ? "running" : "pending";
  const balancedStatus: StageStatus = balancedDone ? "complete" : (fastDone && workerClaimed) ? "running" : "pending";
  const comprehensiveStatus: StageStatus = comprehensiveDone ? "complete" : (balancedDone && workerClaimed) ? "running" : "pending";

  const urlData: UrlAnalysisData | null = urlDone ? {
    detected_name: r.product_name ?? r.domain.split(".")[0],
    category: r.detected_category ?? "other",
    competitors: r.competitors ? (r.competitors as Competitor[]).map((c: Competitor) => c.name) : [],
  } : null;

  const fastData: FastBenchmarkData | null = fastDone ? {
    sessions_analyzed: r.fast_session_count ?? 0,
    mention_rate: r.fast_mention_rate != null ? Math.round(r.fast_mention_rate) : 0,
    platforms: r.fast_platform_coverage ? Object.keys(r.fast_platform_coverage).filter(k => r.fast_platform_coverage[k]) : [],
    primary_mention_type: "mentioned",
  } : null;

  const balancedData: BalancedBenchmarkData | null = balancedDone ? {
    sessions_analyzed: r.balanced_session_count ?? 0,
    mention_rate: r.balanced_mention_rate != null ? Math.round(r.balanced_mention_rate) : 0,
    platforms: r.balanced_platform_coverage ? Object.keys(r.balanced_platform_coverage).filter(k => r.balanced_platform_coverage[k]) : [],
    ai_readiness_score: r.balanced_ai_readiness ?? 0,
    competitor_comparison: (r.balanced_competitor_rates as Array<{ name: string; mentionRate: number; delta: number }> ?? []).map(c => ({
      name: c.name,
      mention_rate: Math.round(c.mentionRate),
      delta: Math.round(c.delta),
    })),
    recommendation_count: r.balanced_recommendations ? (r.balanced_recommendations as unknown[]).length : 0,
    top_recommendation: r.balanced_recommendations && (r.balanced_recommendations as unknown[]).length > 0
      ? (r.balanced_recommendations as Array<{ title: string; priority: "P1" | "P2" | "P3"; impact: "HIGH" | "MEDIUM" | "LOW"; description: string }>)[0]
      : { title: "Run a balanced benchmark", priority: "P2" as const, impact: "MEDIUM" as const, description: "Complete the balanced benchmark to get recommendations." },
  } : null;

  const allRecs = comprehensiveDone && r.comprehensive_recommendations
    ? (r.comprehensive_recommendations as Array<{ title: string; priority: "P1" | "P2" | "P3"; impact: "HIGH" | "MEDIUM" | "LOW"; description: string }>)
    : [];

  const comprehensiveData: ComprehensiveBenchmarkData | null = comprehensiveDone ? {
    sessions_analyzed: r.comprehensive_session_count ?? 0,
    mention_rate: r.comprehensive_mention_rate != null ? Math.round(r.comprehensive_mention_rate) : 0,
    platforms: r.comprehensive_platform_coverage ? Object.keys(r.comprehensive_platform_coverage).filter(k => r.comprehensive_platform_coverage[k]) : [],
    ai_readiness_score: r.comprehensive_ai_readiness ?? 0,
    competitor_comparison: (r.comprehensive_competitor_rates as Array<{ name: string; mentionRate: number; delta: number }> ?? []).map(c => ({
      name: c.name,
      mention_rate: Math.round(c.mentionRate),
      delta: Math.round(c.delta),
    })),
    recommendation_count: allRecs.length,
    top_recommendation: allRecs.length > 0
      ? allRecs[0]
      : { title: "Run a comprehensive benchmark", priority: "P2" as const, impact: "MEDIUM" as const, description: "Complete the comprehensive benchmark to get recommendations." },
    all_recommendations: allRecs,
    constraint_coverage: (r.comprehensive_constraint_coverage as Array<{ constraint: string; addressed_rate: number }>) ?? [],
  } : null;

  return {
    jobId: r.id,
    url: r.url,
    domain: r.domain,
    email: r.email,
    stages: {
      url_analysis: { status: urlAnalysisStatus, data: urlData },
      fast: { status: fastStatus, data: fastData },
      balanced: { status: balancedStatus, data: balancedData },
      comprehensive: { status: comprehensiveStatus, data: comprehensiveData },
    },
  };
}
