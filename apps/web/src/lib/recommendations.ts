import type { VendorScorecard } from "./db";

// ── Types ───────────────────────────────────────────────────────────

export type RecommendationType =
  | "constraint_gap"
  | "competitive_gap"
  | "category_strategy"
  | "implementation_diagnostic"
  | "platform_expansion"
  | "gotcha_resolution";

export interface RecommendationEvidence {
  scenarios?: string[];
  constraints?: string[];
  competitors?: string[];
  winRateDelta?: number;
  frequency?: number;
  currentWinRate?: number;
  potentialWinRate?: number;
}

export interface Recommendation {
  type: RecommendationType;
  priority: 1 | 2 | 3 | 4 | 5;
  title: string;
  detail: string;
  evidence: RecommendationEvidence;
  impact: "high" | "medium" | "low";
}

// ── Constraint Win Rate Computation ─────────────────────────────────

interface ConstraintWinRate {
  constraint: string;
  totalPrompts: number;
  vendorWins: number;
  vendorLosses: number;
  winRate: number;
  competitorWinners: Array<{ competitor: string; wins: number }>;
}

function computeConstraintWinRates(scorecard: VendorScorecard): ConstraintWinRate[] {
  // For each constraint in prompts where vendor was mentioned, compute win rate
  const constraintStats = new Map<
    string,
    { total: number; wins: number; losses: number; compWins: Map<string, number> }
  >();

  // From won prompts: extract constraints
  for (const p of scorecard.promptsWon) {
    const constraints = scorecard.allPromptConstraints[p.prompt_id] ?? [];
    for (const c of constraints) {
      if (!constraintStats.has(c))
        constraintStats.set(c, { total: 0, wins: 0, losses: 0, compWins: new Map() });
      const s = constraintStats.get(c)!;
      s.total++;
      s.wins++;
    }
  }

  // From lost prompts: extract constraints and track winners
  for (const ctx of scorecard.lossContext) {
    for (const c of ctx.promptConstraints) {
      if (!constraintStats.has(c))
        constraintStats.set(c, { total: 0, wins: 0, losses: 0, compWins: new Map() });
      const s = constraintStats.get(c)!;
      s.total++;
      s.losses++;
      s.compWins.set(ctx.winner, (s.compWins.get(ctx.winner) || 0) + 1);
    }
  }

  return Array.from(constraintStats.entries())
    .map(([constraint, s]) => ({
      constraint,
      totalPrompts: s.total,
      vendorWins: s.wins,
      vendorLosses: s.losses,
      winRate: s.total > 0 ? s.wins / s.total : 0,
      competitorWinners: Array.from(s.compWins.entries())
        .map(([competitor, wins]) => ({ competitor, wins }))
        .sort((a, b) => b.wins - a.wins),
    }))
    .filter((c) => c.totalPrompts >= 2)
    .sort((a, b) => a.winRate - b.winRate); // worst win rates first
}

// ── Competitive Gap Computation ─────────────────────────────────────

interface CompetitiveGap {
  competitor: string;
  scenariosLost: string[];
  differentiatingConstraints: string[];
  competitorAddressedConstraints: string[];
}

function computeCompetitiveGaps(scorecard: VendorScorecard): CompetitiveGap[] {
  // Group losses by competitor
  const compMap = new Map<
    string,
    { scenarios: string[]; winnerConstraints: Set<string>; vendorConstraints: Set<string> }
  >();

  for (const ctx of scorecard.lossContext) {
    if (!compMap.has(ctx.winner)) {
      compMap.set(ctx.winner, {
        scenarios: [],
        winnerConstraints: new Set(),
        vendorConstraints: new Set(),
      });
    }
    const entry = compMap.get(ctx.winner)!;
    entry.scenarios.push(ctx.prompt_id);
    for (const c of ctx.winnerConstraintsAddressed) {
      entry.winnerConstraints.add(c);
    }
    // Constraints that were in the prompt — what the vendor could have addressed
    for (const c of ctx.promptConstraints) {
      entry.vendorConstraints.add(c);
    }
  }

  // Also get constraints vendor addresses when winning
  const vendorStrengths = new Set(scorecard.constraintsAddressed.map((c) => c.constraint));

  return Array.from(compMap.entries())
    .map(([competitor, data]) => {
      // Differentiating: constraints the winner addressed that this vendor doesn't typically address
      const differentiating = Array.from(data.winnerConstraints).filter(
        (c) => !vendorStrengths.has(c)
      );

      return {
        competitor,
        scenariosLost: data.scenarios,
        differentiatingConstraints: differentiating,
        competitorAddressedConstraints: Array.from(data.winnerConstraints),
      };
    })
    .filter((g) => g.scenariosLost.length >= 1)
    .sort((a, b) => b.scenariosLost.length - a.scenariosLost.length);
}

// ── Category Performance ────────────────────────────────────────────

interface CategoryPerformance {
  category: string;
  winRate: number;
  wins: number;
  totalScenarios: number;
  isStrength: boolean;
  isWeakness: boolean;
  isBlindspot: boolean;
}

const ALL_CATEGORIES = [
  "database",
  "agent_dev",
  "ci_cd",
  "edge_compute",
  "error_monitoring",
  "feature_flags",
  "llm_observability",
  "observability",
  "secrets_management",
  "security_scanning",
  "developer_portal",
  "incident_management",
  "cross-category",
];

function computeCategoryPerformance(scorecard: VendorScorecard): CategoryPerformance[] {
  const catMap = new Map<string, { wins: number; total: number }>();

  // Initialize from category breakdown
  for (const cat of scorecard.categoryBreakdown) {
    catMap.set(cat.category, {
      wins: cat.recommendations,
      total: cat.totalInCategory,
    });
  }

  return ALL_CATEGORIES.map((category) => {
    const data = catMap.get(category);
    const wins = data?.wins ?? 0;
    const total = data?.total ?? 0;
    const winRate = total > 0 ? wins / total : 0;

    return {
      category,
      winRate,
      wins,
      totalScenarios: total,
      isStrength: winRate > 0.6 && total > 1,
      isWeakness: winRate < 0.3 && total > 1,
      isBlindspot: total === 0,
    };
  });
}

// ── Implementation Diagnostics ──────────────────────────────────────

interface ImplementationDiagnostic {
  unimplementedPrompts: Array<{ prompt_id: string; category: string; platform: string }>;
  platformPattern: Record<string, { implemented: number; total: number }>;
  categoryPattern: Record<string, { implemented: number; total: number }>;
}

function computeImplementationDiagnostics(
  scorecard: VendorScorecard
): ImplementationDiagnostic {
  const unimplemented: Array<{ prompt_id: string; category: string; platform: string }> = [];
  const platformPattern: Record<string, { implemented: number; total: number }> = {};
  const categoryPattern: Record<string, { implemented: number; total: number }> = {};

  for (const ctx of scorecard.implementationContext) {
    // Platform aggregation
    if (!platformPattern[ctx.platform])
      platformPattern[ctx.platform] = { implemented: 0, total: 0 };
    platformPattern[ctx.platform].total++;
    if (ctx.isImplemented) platformPattern[ctx.platform].implemented++;

    // Category aggregation
    if (!categoryPattern[ctx.category])
      categoryPattern[ctx.category] = { implemented: 0, total: 0 };
    categoryPattern[ctx.category].total++;
    if (ctx.isImplemented) categoryPattern[ctx.category].implemented++;

    if (!ctx.isImplemented) {
      unimplemented.push({
        prompt_id: ctx.prompt_id,
        category: ctx.category,
        platform: ctx.platform,
      });
    }
  }

  return { unimplementedPrompts: unimplemented, platformPattern, categoryPattern };
}

// ── Gotcha Clustering ───────────────────────────────────────────────

interface GotchaCluster {
  theme: string;
  snippets: string[];
  count: number;
}

function clusterGotchas(snippets: string[]): GotchaCluster[] {
  if (snippets.length === 0) return [];

  // Simple keyword-based clustering
  const keywords = new Map<string, string[]>();

  for (const snippet of snippets) {
    const lower = snippet.toLowerCase();
    // Extract significant phrases (2+ word sequences)
    const phrases = lower.match(/\b[a-z]+(?:\s+[a-z]+){0,2}\b/g) || [];
    // Find the most distinctive phrase as the cluster key
    let bestKey = "general";
    for (const phrase of phrases) {
      if (
        phrase.length > 5 &&
        !["the", "and", "for", "that", "this", "with", "you", "your", "are", "but"].some(
          (w) => phrase === w
        )
      ) {
        bestKey = phrase;
        break;
      }
    }
    if (!keywords.has(bestKey)) keywords.set(bestKey, []);
    keywords.get(bestKey)!.push(snippet);
  }

  return Array.from(keywords.entries())
    .map(([theme, snips]) => ({
      theme,
      snippets: snips,
      count: snips.length,
    }))
    .sort((a, b) => b.count - a.count);
}

// ── Priority Scoring ────────────────────────────────────────────────

// Constraints more likely addressable via docs/SDK changes (vs fundamental product gaps)
const ADDRESSABLE_CONSTRAINTS = new Set([
  "serverless_compatible",
  "type_safe",
  "connection_pooling",
  "edge_compatible",
  "autoscaling",
  "read_replicas",
  "branching",
  "audit_log",
]);

function computePriority(
  frequency: number,
  maxFrequency: number,
  lossRate: number,
  addressable: boolean
): { priority: 1 | 2 | 3 | 4 | 5; impact: "high" | "medium" | "low" } {
  const freqScore = maxFrequency > 0 ? frequency / maxFrequency : 0;
  const impactScore = freqScore * 0.4 + lossRate * 0.3 + (addressable ? 1 : 0) * 0.3;

  let priority: 1 | 2 | 3 | 4 | 5;
  if (impactScore > 0.7) priority = 1;
  else if (impactScore > 0.5) priority = 2;
  else if (impactScore > 0.3) priority = 3;
  else if (impactScore > 0.15) priority = 4;
  else priority = 5;

  const impact: "high" | "medium" | "low" =
    priority <= 2 ? "high" : priority === 3 ? "medium" : "low";

  return { priority, impact };
}

// ── Main Recommendation Generator ───────────────────────────────────

export function generateRecommendations(scorecard: VendorScorecard): Recommendation[] {
  const recs: Recommendation[] = [];

  // For vendors with very few mentions, only generate simple discoverability recs
  if (scorecard.totalMentions < 3) {
    if (scorecard.totalRecommendations === 0) {
      recs.push({
        type: "category_strategy",
        priority: 3,
        title: "Increase visibility in AI assistant responses",
        detail: `You're mentioned ${scorecard.totalMentions} time${scorecard.totalMentions !== 1 ? "s" : ""} but never selected as the primary recommendation. Focus on improving documentation clarity, SDK simplicity, and getting included in common comparison discussions.`,
        evidence: { frequency: scorecard.totalMentions },
        impact: "medium",
      });
    }
    return recs;
  }

  const constraintWinRates = computeConstraintWinRates(scorecard);
  const competitiveGaps = computeCompetitiveGaps(scorecard);
  const categoryPerf = computeCategoryPerformance(scorecard);
  const implDiag = computeImplementationDiagnostics(scorecard);
  const gotchaClusters = clusterGotchas(scorecard.gotchaSnippets);

  const maxFrequency = Math.max(
    ...constraintWinRates.map((c) => c.totalPrompts),
    ...competitiveGaps.map((g) => g.scenariosLost.length),
    1
  );

  // ── 1. Constraint Gap Recommendations ─────────────────────────────

  for (const cwr of constraintWinRates) {
    // Only flag constraints where vendor loses more than they win
    if (cwr.vendorLosses <= cwr.vendorWins) continue;
    if (cwr.totalPrompts < 2) continue;

    const lossRate = cwr.vendorLosses / cwr.totalPrompts;
    const label = cwr.constraint.replace(/_/g, " ");
    const topComp = cwr.competitorWinners[0];

    const { priority, impact } = computePriority(
      cwr.totalPrompts,
      maxFrequency,
      lossRate,
      ADDRESSABLE_CONSTRAINTS.has(cwr.constraint)
    );

    const compDetail = topComp
      ? ` ${topComp.competitor} addresses it ${topComp.wins}× in winning scenarios.`
      : "";

    recs.push({
      type: "constraint_gap",
      priority,
      title: `Address "${label}" to capture ${cwr.vendorLosses} additional scenario${cwr.vendorLosses > 1 ? "s" : ""}`,
      detail: `Your win rate drops from ${pct(scorecard.winRate)} to ${pct(cwr.winRate)} when "${label}" is required. This constraint appears in ${cwr.totalPrompts} benchmark prompts.${compDetail}`,
      evidence: {
        constraints: [cwr.constraint],
        frequency: cwr.totalPrompts,
        currentWinRate: cwr.winRate,
        potentialWinRate: scorecard.winRate,
        winRateDelta: scorecard.winRate - cwr.winRate,
        competitors: cwr.competitorWinners.map((c) => c.competitor),
      },
      impact,
    });
  }

  // ── 2. Competitive Gap Recommendations ────────────────────────────

  for (const gap of competitiveGaps.slice(0, 3)) {
    if (gap.scenariosLost.length < 1) continue;

    const { priority, impact } = computePriority(
      gap.scenariosLost.length,
      maxFrequency,
      gap.scenariosLost.length / Math.max(scorecard.totalMentions, 1),
      gap.differentiatingConstraints.some((c) => ADDRESSABLE_CONSTRAINTS.has(c))
    );

    const diffLabel =
      gap.differentiatingConstraints.length > 0
        ? ` Their advantage: addressing ${gap.differentiatingConstraints.slice(0, 3).map((c) => c.replace(/_/g, " ")).join(", ")}.`
        : "";

    recs.push({
      type: "competitive_gap",
      priority,
      title: `Close gap with ${gap.competitor} (${gap.scenariosLost.length} loss${gap.scenariosLost.length > 1 ? "es" : ""})`,
      detail: `${gap.competitor} beats you in ${gap.scenariosLost.length} head-to-head scenario${gap.scenariosLost.length > 1 ? "s" : ""}.${diffLabel}`,
      evidence: {
        scenarios: gap.scenariosLost,
        competitors: [gap.competitor],
        constraints: gap.differentiatingConstraints,
        frequency: gap.scenariosLost.length,
      },
      impact,
    });
  }

  // ── 3. Category Strategy Recommendations ──────────────────────────

  // Blindspots: categories where vendor has 0 presence
  const blindspots = categoryPerf.filter((c) => c.isBlindspot && c.category !== "cross-category");
  if (blindspots.length > 0 && blindspots.length <= 8) {
    // Don't flag blindspots if the vendor is only relevant to 1-2 categories
    const activeCats = categoryPerf.filter((c) => c.totalScenarios > 0);
    if (activeCats.length >= 2) {
      const topBlindspots = blindspots.slice(0, 3);
      recs.push({
        type: "category_strategy",
        priority: 4,
        title: `Expand into ${topBlindspots.length} new categor${topBlindspots.length > 1 ? "ies" : "y"}`,
        detail: `You have zero presence in ${topBlindspots.map((b) => b.category.replace(/_/g, " ")).join(", ")}. These categories have active benchmark prompts where competitors are being selected.`,
        evidence: {
          frequency: topBlindspots.length,
        },
        impact: "low",
      });
    }
  }

  // Weaknesses: categories where win rate is very low
  const weaknesses = categoryPerf.filter((c) => c.isWeakness);
  for (const weak of weaknesses.slice(0, 2)) {
    recs.push({
      type: "category_strategy",
      priority: 3,
      title: `Improve ${pct(weak.winRate)} win rate in ${weak.category.replace(/_/g, " ")}`,
      detail: `You're mentioned in ${weak.totalScenarios} ${weak.category.replace(/_/g, " ")} scenarios but only win ${weak.wins}. Analyze the constraints in losing scenarios for targeted improvements.`,
      evidence: {
        frequency: weak.totalScenarios,
        currentWinRate: weak.winRate,
      },
      impact: "medium",
    });
  }

  // ── 4. Implementation Diagnostic Recommendations ──────────────────

  if (
    scorecard.totalRecommendations >= 2 &&
    scorecard.implementationRate < 0.6 &&
    implDiag.unimplementedPrompts.length > 0
  ) {
    const implCount = scorecard.totalRecommendations - implDiag.unimplementedPrompts.length;

    // Check for platform-specific patterns
    const platformIssues = Object.entries(implDiag.platformPattern)
      .filter(([, data]) => data.total > 0 && data.implemented / data.total < 0.5)
      .map(([platform]) => platform);

    const platformNote =
      platformIssues.length > 0
        ? ` Implementation gaps concentrated on ${platformIssues.join(", ")}.`
        : "";

    recs.push({
      type: "implementation_diagnostic",
      priority: 2,
      title: `Fix implementation gap: recommended ${scorecard.totalRecommendations}× but implemented ${implCount}×`,
      detail: `AI assistants recommend you but often don't write the setup code. This suggests SDK complexity or missing AI-friendly documentation.${platformNote}`,
      evidence: {
        scenarios: implDiag.unimplementedPrompts.map((p) => p.prompt_id),
        frequency: implDiag.unimplementedPrompts.length,
      },
      impact: "high",
    });
  }

  // ── 5. Platform Expansion Recommendations ─────────────────────────

  const platforms = Object.keys(scorecard.platformSplit);
  if (platforms.length === 1 && scorecard.totalRecommendations >= 2) {
    const otherPlatforms = ["claude_code", "codex_cli", "cursor"].filter(
      (p) => !platforms.includes(p)
    );

    recs.push({
      type: "platform_expansion",
      priority: 3,
      title: `Expand beyond ${platforms[0]}`,
      detail: `Only recommended on ${platforms[0]} (${scorecard.totalRecommendations}×). ${otherPlatforms.join(" and ")} ${otherPlatforms.length > 1 ? "are" : "is"} not recommending you — improve discoverability through documentation, npm package naming, and example code.`,
      evidence: {
        frequency: scorecard.totalRecommendations,
      },
      impact: "medium",
    });
  }

  // ── 6. Gotcha Resolution Recommendations ──────────────────────────

  if (gotchaClusters.length > 0 && scorecard.gotchaSnippets.length >= 2) {
    const totalGotchas = scorecard.gotchaSnippets.length;
    const topTheme = gotchaClusters[0];

    recs.push({
      type: "gotcha_resolution",
      priority: 3,
      title: `Address ${totalGotchas} AI-flagged gotcha${totalGotchas > 1 ? "s" : ""}`,
      detail: `AI assistants warn about "${topTheme.theme}" (${topTheme.count}×)${gotchaClusters.length > 1 ? ` and ${gotchaClusters.length - 1} other theme${gotchaClusters.length > 2 ? "s" : ""}` : ""}. These warnings may influence developers away from your tool.`,
      evidence: {
        frequency: totalGotchas,
      },
      impact: totalGotchas >= 3 ? "medium" : "low",
    });
  }

  // Sort by priority (ascending = highest priority first), then by frequency
  recs.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (b.evidence.frequency ?? 0) - (a.evidence.frequency ?? 0);
  });

  return recs;
}

// ── Helpers ─────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
