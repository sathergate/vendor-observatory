import type { FactorDef, FactorWeight, VendorFactorData, CategoryFactorSummary } from "./load-vendor-factors";

// ── Types ────────────────────────────────────────────────────────────

export type ImprovementPriority = "critical" | "high" | "medium" | "low";
export type ImpactLevel = "very_high" | "high" | "medium" | "low";

export interface ImprovementSuggestion {
  vendorId: string;
  factorId: string;
  factorLabel: string;
  priority: ImprovementPriority;
  title: string;
  description: string;
  impact: ImpactLevel;
  score: number;
  categoryAvg: number;
  categoryBest: number;
  gap: number;
}

// ── Suggestion templates ─────────────────────────────────────────────

const SUGGESTION_TEMPLATES: Record<string, { title: string; descriptions: Record<number, string> }> = {
  training_data_volume: {
    title: "Increase training data presence",
    descriptions: {
      1: "Publish open-source starter templates and tutorials on GitHub. Create Next.js App Router examples. Write blog posts and contribute SO answers to build training signal.",
      2: "Expand tutorial coverage on GitHub and dev blogs. Ensure examples use current frameworks (Next.js 14+, App Router). Sponsor community content creation.",
      3: "Maintain and grow community content. Ensure official examples stay current with latest framework versions. Consider publishing comparison guides.",
    },
  },
  integration_speed: {
    title: "Reduce integration complexity",
    descriptions: {
      1: "Drastically simplify the SDK. Aim for fewer than 15 lines of code to a working integration. Ship pre-built React components and Next.js middleware.",
      2: "Reduce boilerplate requirements. Provide copy-pasteable quickstart code. Consider shipping React components or hooks that handle common patterns.",
      3: "Polish the SDK developer experience. Reduce config files needed. Provide a single-command setup or init script.",
    },
  },
  serverless_compat: {
    title: "Improve serverless compatibility",
    descriptions: {
      1: "Migrate to HTTP-based APIs. Add automatic connection pooling. Support edge runtimes (Vercel Edge, Cloudflare Workers). Eliminate persistent connection requirements.",
      2: "Add HTTP/REST API option alongside persistent connections. Implement automatic connection pooling for serverless. Test and document edge runtime support.",
      3: "Document serverless best practices. Optimize cold start latency. Ensure edge runtime compatibility is tested in CI.",
    },
  },
  free_tier: {
    title: "Improve free tier offering",
    descriptions: {
      1: "Introduce or restore a meaningful free tier. Developers evaluate tools on free tiers before committing — no free tier means no organic adoption signal.",
      2: "Increase free tier limits to support MVP development through idea validation. Remove inactivity pausing or extend the pause window. Ensure the free tier is a real product, not a demo.",
      3: "Review free tier limits against competitor offerings. Address common pain points (inactivity pausing, low storage caps). Ensure limits cover typical MVP workloads.",
    },
  },
  docs_quality: {
    title: "Improve documentation quality",
    descriptions: {
      1: "Rewrite docs with copy-pasteable code examples for every endpoint. Add TypeScript SDK types that match actual API behavior. Include error message reference.",
      2: "Add complete TypeScript examples. Ensure docs match the latest SDK version. Include Next.js App Router-specific guides (not just Pages Router).",
      3: "Keep docs synchronized with SDK releases. Add more copy-pasteable examples. Include migration guides for version upgrades.",
    },
  },
  stack_fit: {
    title: "Improve Next.js/React ecosystem fit",
    descriptions: {
      1: "Build first-class Next.js App Router integration. Export React components. Support React Server Components. Provide Vercel-optimized deployment guides.",
      2: "Add React component exports alongside REST APIs. Ensure RSC compatibility. Publish Next.js-specific setup guide with App Router examples.",
      3: "Refine React component APIs. Ensure compatibility with latest Next.js features. Add Vercel deployment template.",
    },
  },
  reliability: {
    title: "Build reliability and trust signals",
    descriptions: {
      1: "Stabilize the API — avoid breaking changes without major version bumps. Publish a public status page. Establish a clear deprecation policy. Address pricing concerns transparently.",
      2: "Reduce breaking change frequency. Improve communication around maintenance and pricing changes. Publish uptime SLAs and incident reports.",
      3: "Maintain consistent API versioning. Continue transparent communication. Build track record of stability.",
    },
  },
  security_defaults: {
    title: "Strengthen security defaults",
    descriptions: {
      1: "Implement secure defaults: automatic CSRF protection, parameterized queries, scoped API keys, enforced HTTPS. Generated code should be secure without extra configuration.",
      2: "Add automatic token refresh and session rotation. Implement scoped API keys. Ensure default configurations follow security best practices.",
      3: "Review and tighten default security posture. Add security-focused documentation. Ensure SDK handles common security patterns automatically.",
    },
  },
  cost_predictability: {
    title: "Improve cost predictability",
    descriptions: {
      1: "Publish transparent pricing with calculators. Eliminate surprise overage charges. Offer spending limits or alerts. Consider flat-rate tiers alongside usage-based pricing.",
      2: "Add cost calculators and spending alerts. Make pricing breakpoints clearer. Document at what scale self-hosting becomes more economical.",
      3: "Refine pricing transparency. Add usage dashboards with projected costs. Consider price-lock guarantees for growing teams.",
    },
  },
  escape_hatch: {
    title: "Reduce vendor lock-in risk",
    descriptions: {
      1: "Build on open standards (Postgres, SQLite, Redis, HTTP). Offer full data export. Publish migration guides. Consider an open-source self-hosted option.",
      2: "Add standard-format data export. Publish migration guides to/from alternatives. Consider open-sourcing core components.",
      3: "Ensure data portability. Document migration paths. Build on standard protocols where possible.",
    },
  },
};

// ── Priority computation ─────────────────────────────────────────────

function computePriority(score: number, weight: FactorWeight): ImprovementPriority {
  if (score <= 2 && weight === "very_high") return "critical";
  if (score <= 2) return "high";
  if (score === 3 && weight === "very_high") return "high";
  if (score === 3 && (weight === "high" || weight === "medium_high")) return "medium";
  return "low";
}

function weightToImpact(weight: FactorWeight): ImpactLevel {
  switch (weight) {
    case "very_high": return "very_high";
    case "high": return "high";
    case "medium_high": return "medium";
    case "medium": return "low";
  }
}

// ── Generate improvements ────────────────────────────────────────────

export function generateImprovements(
  vendor: VendorFactorData,
  factors: FactorDef[],
  categorySummary: CategoryFactorSummary | null,
): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];

  for (const factor of factors) {
    const score = vendor.scores[factor.id];
    if (score == null || score >= 4) continue; // Only suggest for scores 1–3

    const catAvg = categorySummary?.avgScores[factor.id] ?? 0;
    const catBest = categorySummary?.bestScores[factor.id] ?? 5;
    const template = SUGGESTION_TEMPLATES[factor.id];
    if (!template) continue;

    suggestions.push({
      vendorId: vendor.vendorId,
      factorId: factor.id,
      factorLabel: factor.label,
      priority: computePriority(score, factor.weight),
      title: template.title,
      description: template.descriptions[score] ?? template.descriptions[3] ?? "",
      impact: weightToImpact(factor.weight),
      score,
      categoryAvg: Math.round(catAvg * 10) / 10,
      categoryBest: catBest,
      gap: catBest - score,
    });
  }

  // Sort by priority: critical > high > medium > low
  const priorityOrder: Record<ImprovementPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}

// ── Aggregate stats ──────────────────────────────────────────────────

export interface FactorAnalyticsStats {
  avgCompositeScore: number;
  criticalCount: number;
  weakestFactor: { id: string; label: string; avgScore: number };
  strongestFactor: { id: string; label: string; avgScore: number };
  totalImprovements: number;
}

export function computeAnalyticsStats(
  vendors: VendorFactorData[],
  factors: FactorDef[],
  globalAvg: Record<string, number>,
): FactorAnalyticsStats {
  const avgComposite =
    vendors.reduce((sum, v) => sum + v.compositeScore, 0) / Math.max(vendors.length, 1);

  // Count critical improvements
  let criticalCount = 0;
  let totalImprovements = 0;
  for (const v of vendors) {
    for (const f of factors) {
      const score = v.scores[f.id];
      if (score != null && score <= 3) {
        totalImprovements++;
        if (score <= 2 && f.weight === "very_high") criticalCount++;
      }
    }
  }

  // Find weakest and strongest factors globally
  let weakest = { id: "", label: "", avgScore: Infinity };
  let strongest = { id: "", label: "", avgScore: -Infinity };
  for (const f of factors) {
    const avg = globalAvg[f.id] ?? 0;
    if (avg < weakest.avgScore) weakest = { id: f.id, label: f.short, avgScore: avg };
    if (avg > strongest.avgScore) strongest = { id: f.id, label: f.short, avgScore: avg };
  }

  return {
    avgCompositeScore: Math.round(avgComposite * 10) / 10,
    criticalCount,
    weakestFactor: { ...weakest, avgScore: Math.round(weakest.avgScore * 10) / 10 },
    strongestFactor: { ...strongest, avgScore: Math.round(strongest.avgScore * 10) / 10 },
    totalImprovements,
  };
}
