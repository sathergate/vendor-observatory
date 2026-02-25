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
    comprehensive: { status: StageStatus; data: null };
  };
}

// ── DB Pool (same lazy pattern as auth.ts) ───────────────────────────

let _pool: Pool | null = null;
let _poolFailed = false;
let _tablesReady = false;

function getPool(): Pool | null {
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
      // Stage timestamps
      ["url_analysis_completed_at", "TIMESTAMPTZ"],
      ["fast_completed_at", "TIMESTAMPTZ"],
      ["balanced_completed_at", "TIMESTAMPTZ"],
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

// ── Deterministic mock data helpers ──────────────────────────────────

/**
 * Returns a stable float 0–1 for a given domain + salt.
 * Used to generate deterministic mock data per domain.
 */
export function domainSeed(domain: string, salt: number): number {
  let h = 5381 + salt;
  for (let i = 0; i < domain.length; i++) {
    h = ((h << 5) + h) ^ domain.charCodeAt(i);
  }
  return Math.abs(h % 1000) / 1000;
}

const CATEGORIES = [
  "Error Monitoring",
  "Database",
  "Authentication",
  "Hosting & Deployment",
  "Analytics",
  "Payments",
  "Search",
  "CI/CD",
  "Logging",
  "Feature Flags",
  "Email",
  "Storage",
];

const COMPETITOR_POOL: Record<string, string[]> = {
  "Error Monitoring": ["Sentry", "Bugsnag", "Datadog", "Rollbar", "Raygun"],
  Database: ["Supabase", "PlanetScale", "Neon", "Firebase", "MongoDB Atlas"],
  Authentication: ["Auth0", "Clerk", "Firebase Auth", "Supabase Auth", "WorkOS"],
  "Hosting & Deployment": ["Vercel", "Netlify", "Railway", "Fly.io", "Render"],
  Analytics: ["PostHog", "Mixpanel", "Amplitude", "Plausible", "Heap"],
  Payments: ["Stripe", "LemonSqueezy", "Paddle", "Braintree", "Square"],
  Search: ["Algolia", "Typesense", "Meilisearch", "Elasticsearch", "Pinecone"],
  "CI/CD": ["GitHub Actions", "CircleCI", "GitLab CI", "Buildkite", "Travis CI"],
  Logging: ["Datadog", "Logtail", "Axiom", "New Relic", "Splunk"],
  "Feature Flags": ["LaunchDarkly", "Statsig", "Flagsmith", "Split", "GrowthBook"],
  Email: ["Resend", "SendGrid", "Postmark", "Mailgun", "Amazon SES"],
  Storage: ["Cloudflare R2", "AWS S3", "Backblaze B2", "MinIO", "DigitalOcean Spaces"],
};

const MENTION_TYPES = ["recommended", "mentioned", "compared", "installed"];

const RECOMMENDATIONS = [
  {
    title: "Add structured data to documentation",
    description: "Ensure your developer docs include structured code examples that AI assistants can easily parse and recommend.",
  },
  {
    title: "Improve SDK discoverability",
    description: "Publish your SDK to popular package registries with clear, keyword-rich descriptions.",
  },
  {
    title: "Create integration guides for popular frameworks",
    description: "Write step-by-step integration guides for Next.js, Express, and other popular frameworks.",
  },
  {
    title: "Optimize error messages for AI comprehension",
    description: "Make error messages descriptive and actionable so AI assistants can suggest your product as a fix.",
  },
  {
    title: "Build a comparison page against competitors",
    description: "Create transparent comparison content that helps AI assistants accurately position your product.",
  },
];

// TODO: Replace with real URL analysis engine that fetches the page and uses
// an LLM to extract product name, category, and competitors.
function generateUrlAnalysis(domain: string): UrlAnalysisData {
  const name = domain.split(".")[0];
  const detected_name = name.charAt(0).toUpperCase() + name.slice(1);

  const catIdx = Math.floor(domainSeed(domain, 1) * CATEGORIES.length);
  const category = CATEGORIES[catIdx];

  const pool = COMPETITOR_POOL[category] || COMPETITOR_POOL["Error Monitoring"];
  const competitors = pool
    .filter((c) => c.toLowerCase() !== detected_name.toLowerCase())
    .slice(0, 3);

  return { detected_name, category, competitors };
}

// TODO: Replace with real fast benchmark analysis.
function generateFastBenchmark(domain: string): FastBenchmarkData {
  const seed = domainSeed(domain, 2);
  return {
    sessions_analyzed: Math.floor(50 + seed * 200),
    mention_rate: Math.round(domainSeed(domain, 3) * 80 + 5),
    platforms: ["Claude Code", "Codex CLI"],
    primary_mention_type: MENTION_TYPES[Math.floor(domainSeed(domain, 4) * MENTION_TYPES.length)],
  };
}

// TODO: Replace with real balanced benchmark analysis.
function generateBalancedBenchmark(domain: string): BalancedBenchmarkData {
  const urlAnalysis = generateUrlAnalysis(domain);
  const mentionRate = Math.round(domainSeed(domain, 3) * 80 + 5);
  const aiScore = Math.round(domainSeed(domain, 5) * 70 + 20);

  const competitor_comparison = urlAnalysis.competitors.map((name, i) => {
    const compRate = Math.round(domainSeed(domain, 10 + i) * 80 + 5);
    return {
      name,
      mention_rate: compRate,
      delta: mentionRate - compRate,
    };
  });

  const recCount = Math.floor(domainSeed(domain, 6) * 4) + 3;
  const topRecIdx = Math.floor(domainSeed(domain, 7) * RECOMMENDATIONS.length);
  const priorities: Array<"P1" | "P2" | "P3"> = ["P1", "P2", "P3"];
  const impacts: Array<"HIGH" | "MEDIUM" | "LOW"> = ["HIGH", "MEDIUM", "LOW"];

  return {
    sessions_analyzed: Math.floor(200 + domainSeed(domain, 8) * 500),
    mention_rate: mentionRate,
    platforms: ["Claude Code", "Codex CLI", "Cursor"],
    ai_readiness_score: aiScore,
    competitor_comparison,
    recommendation_count: recCount,
    top_recommendation: {
      title: RECOMMENDATIONS[topRecIdx].title,
      priority: priorities[Math.floor(domainSeed(domain, 9) * priorities.length)],
      impact: impacts[Math.floor(domainSeed(domain, 11) * impacts.length)],
      description: RECOMMENDATIONS[topRecIdx].description,
    },
  };
}

// ── Stage timing logic ───────────────────────────────────────────────

// TODO: Replace with real job dispatch and status tracking.
// Currently mocks completion based on elapsed time since job creation.
export function stageStatusFromElapsed(elapsed: number): {
  url_analysis: StageStatus;
  fast: StageStatus;
  balanced: StageStatus;
  comprehensive: StageStatus;
} {
  return {
    url_analysis: elapsed > 15 ? "complete" : elapsed > 0 ? "running" : "pending",
    fast: elapsed > 30 ? "complete" : elapsed > 15 ? "running" : "pending",
    balanced: elapsed > 120 ? "complete" : elapsed > 30 ? "running" : "pending",
    comprehensive: elapsed > 300 ? "complete" : elapsed > 120 ? "running" : "pending",
  };
}

// ── In-memory fallback when no DB is available ──────────────────────
// TODO: Remove this in-memory fallback once DATABASE_URL is configured
// in all environments. This exists only so the onboarding flow works
// on Vercel without a Postgres database during early development.

const _memoryJobs = new Map<string, OnboardingJob>();

// ── DB functions ─────────────────────────────────────────────────────

export async function createJob(url: string, domain: string): Promise<string> {
  await ensureTables();
  const id = crypto.randomUUID();
  const now = new Date();
  const pool = getPool();
  if (pool) {
    await pool.query(
      "INSERT INTO onboarding_jobs (id, url, domain) VALUES ($1, $2, $3)",
      [id, url, domain],
    );
  } else {
    _memoryJobs.set(id, { id, url, domain, email: null, created_at: now });
  }
  return id;
}

export async function findRecentJob(domain: string): Promise<string | null> {
  await ensureTables();
  const pool = getPool();
  if (pool) {
    const { rows } = await pool.query(
      `SELECT id FROM onboarding_jobs
       WHERE domain = $1 AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [domain],
    );
    return rows.length > 0 ? rows[0].id : null;
  }
  // In-memory fallback
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const job of _memoryJobs.values()) {
    if (job.domain === domain && job.created_at.getTime() > cutoff) {
      return job.id;
    }
  }
  return null;
}

export async function getJob(jobId: string): Promise<OnboardingJob | null> {
  await ensureTables();
  const pool = getPool();
  if (pool) {
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
  // In-memory fallback
  return _memoryJobs.get(jobId) ?? null;
}

export async function saveJobEmail(jobId: string, email: string): Promise<void> {
  await ensureTables();
  const pool = getPool();
  if (pool) {
    await pool.query(
      "UPDATE onboarding_jobs SET email = $1 WHERE id = $2",
      [email, jobId],
    );
  } else {
    const job = _memoryJobs.get(jobId);
    if (job) job.email = email;
  }
}

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const useReal = process.env.USE_REAL_BENCHMARK === "true";

  // Try real DB path first when feature flag is on
  if (useReal) {
    const pool = getPool();
    if (pool) {
      await ensureTables();
      const { rows } = await pool.query(
        `SELECT id, url, domain, email, created_at,
                product_name, detected_category, competitors,
                fast_mention_rate, fast_session_count, fast_platform_coverage, fast_competitor_rates,
                balanced_mention_rate, balanced_session_count, balanced_ai_readiness,
                balanced_platform_coverage, balanced_competitor_rates, balanced_recommendations,
                url_analysis_completed_at, fast_completed_at, balanced_completed_at,
                worker_claimed_at, error
         FROM onboarding_jobs WHERE id = $1`,
        [jobId]
      );
      if (rows.length > 0) {
        const r = rows[0];
        const urlDone = !!r.url_analysis_completed_at;
        const fastDone = !!r.fast_completed_at;
        const balancedDone = !!r.balanced_completed_at;
        const workerClaimed = !!r.worker_claimed_at;

        const urlAnalysisStatus: StageStatus = urlDone ? "complete" : workerClaimed ? "running" : "pending";
        const fastStatus: StageStatus = fastDone ? "complete" : (urlDone && workerClaimed) ? "running" : "pending";
        const balancedStatus: StageStatus = balancedDone ? "complete" : (fastDone && workerClaimed) ? "running" : "pending";

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

        return {
          jobId: r.id,
          url: r.url,
          domain: r.domain,
          email: r.email,
          stages: {
            url_analysis: { status: urlAnalysisStatus, data: urlData },
            fast: { status: fastStatus, data: fastData },
            balanced: { status: balancedStatus, data: balancedData },
            comprehensive: { status: "pending", data: null },
          },
        };
      }
    }
  }

  // Fallback to mock data
  const job = await getJob(jobId);
  if (!job) return null;

  const elapsed = (Date.now() - job.created_at.getTime()) / 1000;
  const stages = stageStatusFromElapsed(elapsed);

  return {
    jobId: job.id,
    url: job.url,
    domain: job.domain,
    email: job.email,
    stages: {
      url_analysis: {
        status: stages.url_analysis,
        data: stages.url_analysis === "complete" ? generateUrlAnalysis(job.domain) : null,
      },
      fast: {
        status: stages.fast,
        data: stages.fast === "complete" ? generateFastBenchmark(job.domain) : null,
      },
      balanced: {
        status: stages.balanced,
        data: stages.balanced === "complete" ? generateBalancedBenchmark(job.domain) : null,
      },
      comprehensive: {
        status: stages.comprehensive,
        data: null,
      },
    },
  };
}
