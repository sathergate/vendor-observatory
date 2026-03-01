import { Pool } from "pg";

export interface CompetitorRate {
  name: string;
  mentionRate: number;
  delta: number;
}

export interface ScoreResult {
  mentionRate: number;      // 0-100 percentage
  installRate: number;      // 0-100 percentage
  configRate: number;       // 0-100 percentage
  sessionCount: number;
  aiReadiness: number;      // 0-100 composite score
  platformCoverage: Record<string, boolean>;
  competitorRates: CompetitorRate[];
}

interface Competitor {
  name: string;
  domain?: string;
  canonicalId?: string;
}

/**
 * After ingest writes observations to PostgreSQL, query the DB to compute
 * mention rates, AI readiness score, and competitor comparison.
 *
 * Observations are scoped to this job by matching sessions whose cwd
 * contains the job ID (set by the parallel runner workspace paths).
 */
export async function computeScores(
  jobId: string,
  vendorId: string,
  competitors: Competitor[],
  pool: Pool,
): Promise<ScoreResult> {
  // Count total benchmark sessions for this job
  // Sessions are scoped by their cwd containing the job ID
  const { rows: sessionRows } = await pool.query(
    `SELECT id, source_platform FROM sessions
     WHERE is_benchmark = TRUE
       AND cwd LIKE $1
     ORDER BY started_at DESC`,
    [`%${jobId}%`]
  );

  const sessionCount = sessionRows.length;
  if (sessionCount === 0) {
    return {
      mentionRate: 0,
      installRate: 0,
      configRate: 0,
      sessionCount: 0,
      aiReadiness: 0,
      platformCoverage: {},
      competitorRates: [],
    };
  }

  const sessionIds = sessionRows.map((r: { id: string }) => r.id);

  // Count sessions mentioning the target vendor
  const { rows: mentionRows } = await pool.query(
    `SELECT DISTINCT session_id FROM observations
     WHERE vendor_canonical_id = $1 AND session_id = ANY($2)`,
    [vendorId, sessionIds]
  );
  const mentionCount = mentionRows.length;
  const mentionRate = (mentionCount / sessionCount) * 100;

  // Install rate
  const { rows: installRows } = await pool.query(
    `SELECT DISTINCT session_id FROM observations
     WHERE vendor_canonical_id = $1 AND mention_type = 'installed' AND session_id = ANY($2)`,
    [vendorId, sessionIds]
  );
  const installRate = (installRows.length / sessionCount) * 100;

  // Config rate
  const { rows: configRows } = await pool.query(
    `SELECT DISTINCT session_id FROM observations
     WHERE vendor_canonical_id = $1 AND mention_type IN ('configured', 'implemented') AND session_id = ANY($2)`,
    [vendorId, sessionIds]
  );
  const configRate = (configRows.length / sessionCount) * 100;

  // Platform coverage
  const platforms = new Set(sessionRows.map((r: { source_platform: string }) => r.source_platform));
  const platformsWithMention = new Set<string>();
  for (const m of mentionRows) {
    const session = sessionRows.find((s: { id: string }) => s.id === m.session_id);
    if (session) platformsWithMention.add(session.source_platform);
  }
  const platformCoverage: Record<string, boolean> = {};
  for (const p of platforms) {
    platformCoverage[p] = platformsWithMention.has(p);
  }

  // Competitor rates
  const competitorRates: CompetitorRate[] = [];
  for (const comp of competitors) {
    // Try to find the competitor's canonical ID
    const compId = comp.canonicalId ?? await findVendorId(comp.name, pool);
    if (!compId) {
      competitorRates.push({ name: comp.name, mentionRate: 0, delta: mentionRate });
      continue;
    }

    const { rows: compMentions } = await pool.query(
      `SELECT DISTINCT session_id FROM observations
       WHERE vendor_canonical_id = $1 AND session_id = ANY($2)`,
      [compId, sessionIds]
    );
    const compRate = (compMentions.length / sessionCount) * 100;
    competitorRates.push({
      name: comp.name,
      mentionRate: compRate,
      delta: mentionRate - compRate,
    });
  }

  // AI Readiness composite score (0-100)
  // mention_rate * 40% + install_rate * 40% + config_rate * 20%
  const aiReadiness = Math.round(
    mentionRate * 0.4 + installRate * 0.4 + configRate * 0.2
  );

  return {
    mentionRate: Math.round(mentionRate * 10) / 10,
    installRate: Math.round(installRate * 10) / 10,
    configRate: Math.round(configRate * 10) / 10,
    sessionCount,
    aiReadiness: Math.min(100, aiReadiness),
    platformCoverage,
    competitorRates,
  };
}

/**
 * Compute scores from fast_benchmark_responses table (direct API probes).
 * Unlike computeScores() which reads sessions+observations, this reads
 * the denormalized vendor_mentions JSONB column directly.
 */
export async function computeFastScores(
  jobId: string,
  vendorId: string,
  competitors: Competitor[],
  pool: Pool,
): Promise<ScoreResult> {
  const { rows } = await pool.query(
    "SELECT vendor_mentions, primary_vendor, error FROM fast_benchmark_responses WHERE job_id = $1",
    [jobId],
  );

  const totalResponses = rows.length;
  if (totalResponses === 0) {
    return {
      mentionRate: 0,
      installRate: 0,
      configRate: 0,
      sessionCount: 0,
      aiReadiness: 0,
      platformCoverage: {},
      competitorRates: [],
    };
  }

  const successfulRows = rows.filter(r => !r.error);
  const successfulResponses = successfulRows.length;

  // Count responses mentioning the target vendor
  let mentionCount = 0;
  for (const row of successfulRows) {
    const mentions = (row.vendor_mentions ?? []) as Array<{ vendor: string; mentionType: string }>;
    if (mentions.some(m => m.vendor === vendorId)) {
      mentionCount++;
    }
  }

  const mentionRate = successfulResponses > 0
    ? (mentionCount / successfulResponses) * 100
    : 0;

  // Competitor rates
  const competitorRates: CompetitorRate[] = [];
  for (const comp of competitors) {
    const compId = comp.canonicalId ?? await findVendorId(comp.name, pool);
    if (!compId) {
      competitorRates.push({ name: comp.name, mentionRate: 0, delta: mentionRate });
      continue;
    }

    let compMentionCount = 0;
    for (const row of successfulRows) {
      const mentions = (row.vendor_mentions ?? []) as Array<{ vendor: string }>;
      if (mentions.some(m => m.vendor === compId)) {
        compMentionCount++;
      }
    }
    const compRate = successfulResponses > 0
      ? (compMentionCount / successfulResponses) * 100
      : 0;
    competitorRates.push({
      name: comp.name,
      mentionRate: Math.round(compRate * 10) / 10,
      delta: Math.round((mentionRate - compRate) * 10) / 10,
    });
  }

  // API probes don't install or configure anything
  const aiReadiness = Math.round(mentionRate * 0.4);

  return {
    mentionRate: Math.round(mentionRate * 10) / 10,
    installRate: 0,
    configRate: 0,
    sessionCount: successfulResponses,
    aiReadiness: Math.min(100, aiReadiness),
    platformCoverage: { api_probe: mentionCount > 0 },
    competitorRates,
  };
}

async function findVendorId(name: string, pool: Pool): Promise<string | null> {
  const { rows } = await pool.query(
    "SELECT canonical_id FROM vendors WHERE LOWER(display_name) = LOWER($1) LIMIT 1",
    [name]
  );
  if (rows.length > 0) return rows[0].canonical_id;

  // Try synonym match
  const { rows: synRows } = await pool.query(
    "SELECT canonical_id FROM vendors WHERE $1 = ANY(synonyms) LIMIT 1",
    [name.toLowerCase()]
  );
  if (synRows.length > 0) return synRows[0].canonical_id;

  return null;
}
