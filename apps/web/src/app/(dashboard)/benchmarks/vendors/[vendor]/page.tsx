import Link from "next/link";
import { getVendorScorecard, getVendorHeadToHead, getVendorTrend } from "@/lib/db";
import { generateRecommendations, computeAIReadinessScore, type Recommendation } from "@/lib/recommendations";
import { vendorDisplayName, VENDOR_META, vendorCategory } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { TabbedView, TabPanel } from "@/components/TabbedView";
import { VendorGuard } from "@/components/VendorGuard";
import { loadCategoryMeta } from "../../categories";
import { PROMPT_SUMMARIES } from "../../prompt-summaries";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

const IMPACT_STYLES = {
  high: {
    border: "border-l-data-4",
    bg: "bg-data-4/5",
    pill: "bg-data-4/20 text-data-4",
    badge: "bg-data-4/30 text-data-4",
  },
  medium: {
    border: "border-l-data-3",
    bg: "bg-data-3/5",
    pill: "bg-data-3/20 text-data-3",
    badge: "bg-data-3/30 text-data-3",
  },
  low: {
    border: "border-l-data-muted",
    bg: "bg-surface/50",
    pill: "bg-raised text-muted",
    badge: "bg-raised text-muted",
  },
} as const;

function RecommendationCard({ rec, index }: { rec: Recommendation; index: number }) {
  const style = IMPACT_STYLES[rec.impact];
  const hasEvidence =
    (rec.evidence.scenarios && rec.evidence.scenarios.length > 0) ||
    (rec.evidence.constraints && rec.evidence.constraints.length > 0) ||
    (rec.evidence.competitors && rec.evidence.competitors.length > 0) ||
    rec.evidence.winRateDelta !== undefined;

  return (
    <div className={`border-l-4 ${style.border} ${style.bg} rounded-r-[6px] p-4`}>
      <div className="flex items-start gap-3">
        <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-[6px] ${style.badge} shrink-0 mt-0.5 font-data`}>
          P{rec.priority}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-semibold text-primary">{rec.title}</h3>
            <span className={`text-[12px] px-1.5 py-0.5 rounded-[6px] ${style.pill}`}>
              {rec.impact.toUpperCase()}
            </span>
          </div>
          <p className="text-[14px] text-secondary mt-1">{rec.detail}</p>

          {hasEvidence && (
            <details className="mt-2">
              <summary className="text-[12px] text-muted cursor-pointer hover:text-secondary">
                Evidence
              </summary>
              <div className="mt-2 space-y-1.5">
                {rec.evidence.winRateDelta !== undefined && (
                  <div className="text-[12px] text-secondary">
                    Win rate impact: {rec.evidence.currentWinRate !== undefined && (
                      <span className="font-data text-data-4">{pct(rec.evidence.currentWinRate)}</span>
                    )} &rarr; {rec.evidence.potentialWinRate !== undefined && (
                      <span className="font-data text-data-5">{pct(rec.evidence.potentialWinRate)}</span>
                    )} (delta: <span className="font-data">+{pct(rec.evidence.winRateDelta)}</span>)
                  </div>
                )}
                {rec.evidence.scenarios && rec.evidence.scenarios.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {rec.evidence.scenarios.map((s) => (
                      <Link
                        key={s}
                        href={`/benchmarks/${PROMPT_SUMMARIES[s]?.scenario ? s.split("-")[0] : "database"}`}
                        className="text-[12px] px-1.5 py-0.5 rounded-[6px] bg-raised text-secondary hover:text-accent"
                      >
                        {PROMPT_SUMMARIES[s]?.title || s}
                      </Link>
                    ))}
                  </div>
                )}
                {rec.evidence.constraints && rec.evidence.constraints.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {rec.evidence.constraints.map((c) => (
                      <span key={c} className="text-[12px] px-1.5 py-0.5 rounded-[6px] bg-data-1/15 text-data-1">
                        {c.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
                {rec.evidence.competitors && rec.evidence.competitors.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {rec.evidence.competitors.map((comp) => (
                      <Link
                        key={comp}
                        href={`/benchmarks/vendors/${encodeURIComponent(comp)}`}
                        className="text-[12px] px-1.5 py-0.5 rounded-[6px] bg-accent/15 text-accent hover:bg-accent/25"
                      >
                        vs {vendorDisplayName(comp)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function VendorScorecardPage({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor } = await params;
  const vendorId = decodeURIComponent(vendor);
  const [scorecard, CATEGORY_META] = await Promise.all([
    getVendorScorecard(vendorId),
    loadCategoryMeta(),
  ]);

  if (!scorecard) {
    return (
      <div className="space-y-4">
        <Breadcrumb items={[
          { label: "Home", href: "/" },
          { label: "Vendor Intel", href: "/benchmarks/vendors" },
          { label: vendorDisplayName(vendorId) },
        ]} />
        <VendorGuard vendorId={vendorId}>
          <div className="quiet-signal">
            <p className="text-[16px] text-secondary">No data found for &ldquo;{vendorDisplayName(vendorId)}&rdquo;</p>
            <p className="text-[14px] mt-2 text-muted">This vendor hasn&apos;t appeared in any benchmark responses yet.</p>
          </div>
        </VendorGuard>
      </div>
    );
  }

  const meta = VENDOR_META[vendorId];
  const recommendations = generateRecommendations(scorecard);
  const aiReadiness = computeAIReadinessScore(scorecard);
  const trend = await getVendorTrend(vendorId);

  // Find top competitor for head-to-head
  const topCompetitor = scorecard.competitorWins[0];
  const h2h = topCompetitor ? await getVendorHeadToHead(vendorId, topCompetitor.competitor) : null;

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Home", href: "/" },
        { label: "Vendor Intel", href: "/benchmarks/vendors" },
        { label: vendorDisplayName(vendorId) },
      ]} />

      <VendorGuard vendorId={vendorId}>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-primary">{vendorDisplayName(vendorId)}</h1>
          <div className="flex items-center gap-3 mt-1">
            {meta?.website && (
              <span className="text-[14px] text-muted">{meta.website}</span>
            )}
            {meta?.category && CATEGORY_META[meta.category] && (
              <Link
                href={`/benchmarks/${meta.category}`}
                className="text-[12px] px-2 py-0.5 rounded-[6px] bg-raised text-secondary hover:bg-border-subtle"
              >
                {CATEGORY_META[meta.category].icon} {CATEGORY_META[meta.category].label}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Tabbed Navigation */}
      <TabbedView sections={[
        { id: "overview", label: "Overview" },
        { id: "signals", label: "Signals" },
        ...(recommendations.length > 0 ? [{ id: "actions", label: "Actions" }] : []),
      ]}>

      {/* ── Overview: Profile + AI-Readiness + Trend ─────────────────── */}
      <TabPanel id="overview">
        <div className="space-y-8">

        {/* Detection Profile */}
        <div>
          <h2 className="section-header mb-3">Detection Profile</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-surface rounded-[6px] p-6 border border-border">
              <p className="stat-label">Primary Detections</p>
              <p className="stat-hero mt-1 text-accent">{scorecard.totalRecommendations.toLocaleString()}</p>
            </div>
            <div className="bg-surface rounded-[6px] p-6 border border-border">
              <p className="stat-label">Total Mentions</p>
              <p className="stat-hero mt-1">{scorecard.totalMentions.toLocaleString()}</p>
            </div>
            <div className="bg-surface rounded-[6px] p-6 border border-border">
              <p className="stat-label">Win Rate</p>
              <p className={`stat-hero mt-1 ${
                scorecard.winRate > 0.6 ? "text-data-5" : scorecard.winRate > 0.3 ? "text-data-3" : "text-data-4"
              }`}>
                {pct(scorecard.winRate)}
              </p>
            </div>
            <div className="bg-surface rounded-[6px] p-6 border border-border">
              <p className="stat-label">Implementation Rate</p>
              <p className={`stat-hero mt-1 ${
                scorecard.implementationRate > 0.6 ? "text-data-5" : scorecard.implementationRate > 0.3 ? "text-data-3" : "text-data-4"
              }`}>
                {pct(scorecard.implementationRate)}
              </p>
            </div>
          </div>

          {/* Platform split */}
          {Object.keys(scorecard.platformSplit).length > 0 && (
            <div className="mt-3 flex gap-2">
              {Object.entries(scorecard.platformSplit).map(([platform, count]) => (
                <span
                  key={platform}
                  className="text-[14px] px-2 py-1 rounded-[6px] bg-raised text-secondary font-data"
                >
                  {platform}: {count}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* AI-Readiness Breakdown */}
        <div>
          <h2 className="section-header mb-3">AI-Readiness</h2>
          <div className="bg-surface rounded-[6px] p-6 border border-border">
            <div className="space-y-3">
              {[
                { label: "Implementation Rate", data: aiReadiness.breakdown.implementationRate, desc: "How often AI writes code after detecting" },
                { label: "Win Rate", data: aiReadiness.breakdown.winRate, desc: "How often selected as primary choice" },
                { label: "Constraint Coverage", data: aiReadiness.breakdown.constraintCoverage, desc: "% of prompt constraints addressed" },
                { label: "Gotcha Avoidance", data: aiReadiness.breakdown.gotchaRate, desc: "Fewer gotchas = more AI-friendly" },
                { label: "Cross-Platform", data: aiReadiness.breakdown.crossPlatformConsistency, desc: "Consistency across assistants" },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-primary">{item.label}</span>
                    <span className={`font-data ${
                      item.data.score >= 70 ? "text-data-5" :
                      item.data.score >= 40 ? "text-data-3" :
                      "text-data-4"
                    }`}>
                      {item.data.score}/100
                    </span>
                  </div>
                  <div className="w-full bg-data-muted rounded-[6px] h-2">
                    <div
                      className={`h-2 rounded-[6px] transition-all ${
                        item.data.score >= 70 ? "bg-data-5" :
                        item.data.score >= 40 ? "bg-data-3" :
                        "bg-data-4"
                      }`}
                      style={{ width: `${Math.max(2, item.data.score)}%` }}
                    />
                  </div>
                  <p className="text-[12px] text-muted mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trend */}
        {trend && trend.dataPoints.length > 0 && (
          <div>
            <h2 className="section-header mb-3">Trend</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-surface rounded-[6px] p-6 border border-border">
                <p className="stat-label">Win Rate Trend</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-[24px] font-bold text-primary">
                    {trend.trend === "rising" ? "\u2191" : trend.trend === "falling" ? "\u2193" : "\u2192"}
                  </span>
                  <span className={`font-data text-[20px] ${
                    trend.trend === "rising" ? "text-data-5" :
                    trend.trend === "falling" ? "text-data-4" :
                    "text-secondary"
                  }`}>
                    {trend.winRateDelta >= 0 ? "+" : ""}{pct(trend.winRateDelta)}
                  </span>
                </div>
                <p className="stat-context mt-1">
                  {pct(trend.previousWinRate)} &rarr; {pct(trend.currentWinRate)}
                </p>
              </div>
              <div className="bg-surface rounded-[6px] p-6 border border-border">
                <p className="stat-label">Mention Volume</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={`font-data text-[24px] ${
                    trend.mentionDelta > 0 ? "text-data-5" :
                    trend.mentionDelta < 0 ? "text-data-4" :
                    "text-secondary"
                  }`}>
                    {trend.currentMentions.toLocaleString()}
                  </span>
                  <span className="text-[14px] text-muted font-data">
                    ({trend.mentionDelta >= 0 ? "+" : ""}{trend.mentionDelta} vs prior)
                  </span>
                </div>
              </div>
              <div className="bg-surface rounded-[6px] p-6 border border-border">
                <p className="stat-label">Weekly Activity</p>
                <div className="flex items-end gap-1 mt-2 h-12">
                  {trend.dataPoints.map((dp, i) => {
                    const maxMentions = Math.max(...trend.dataPoints.map(p => p.mentions), 1);
                    const height = Math.max(4, (dp.mentions / maxMentions) * 48);
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${
                          dp.winRate > 0.5 ? "bg-data-5/70" :
                          dp.winRate > 0 ? "bg-data-3/70" :
                          "bg-data-muted"
                        }`}
                        style={{ height: `${height}px` }}
                        title={`${dp.weekStart}: ${dp.mentions} mentions, ${pct(dp.winRate)} win rate`}
                      />
                    );
                  })}
                </div>
                <p className="stat-context mt-1">
                  {trend.dataPoints.length} week{trend.dataPoints.length !== 1 ? "s" : ""} of data
                </p>
              </div>
            </div>
          </div>
        )}

        </div>
      </TabPanel>

      {/* ── Signals: Categories + Constraints + Competitive + Scenarios + Trade-offs + Rationale ── */}
      <TabPanel id="signals">
        <div className="space-y-8">

        {/* Category Breakdown */}
        {scorecard.categoryBreakdown.length > 0 && (
          <div>
            <h2 className="section-header mb-3">Category Breakdown</h2>
            <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="th-label text-left px-4 py-3">Category</th>
                    <th className="th-label text-right px-4 py-3">Detected</th>
                    <th className="th-label text-right px-4 py-3">Compared</th>
                    <th className="th-label text-right px-4 py-3">Rejected</th>
                    <th className="th-label text-right px-4 py-3">Total</th>
                    <th className="th-label text-right px-4 py-3">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.categoryBreakdown.map((cat) => {
                    const catMeta = CATEGORY_META[cat.category];
                    const wr = cat.totalInCategory > 0 ? cat.recommendations / cat.totalInCategory : 0;
                    return (
                      <tr key={cat.category} className="border-b border-border-subtle hover:bg-raised">
                        <td className="px-4 py-2">
                          <Link href={`/benchmarks/${cat.category}`} className="hover:text-accent transition-colors text-primary">
                            {catMeta ? `${catMeta.icon} ${catMeta.label}` : cat.category}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right font-data text-accent">
                          {cat.recommendations > 0 ? cat.recommendations.toLocaleString() : <span className="text-muted">-</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-data text-data-3">
                          {cat.comparisons > 0 ? cat.comparisons.toLocaleString() : <span className="text-muted">-</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-data text-data-4">
                          {cat.rejections > 0 ? cat.rejections.toLocaleString() : <span className="text-muted">-</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-data text-secondary">{cat.totalInCategory.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-data font-medium ${
                            wr > 0.6 ? "text-data-5" : wr > 0.3 ? "text-data-3" : "text-data-4"
                          }`}>
                            {pct(wr)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Constraint Scorecard */}
        {(scorecard.constraintsAddressed.length > 0 || scorecard.constraintsMissed.length > 0) && (
          <div>
            <h2 className="section-header mb-3">Constraint Scorecard</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scorecard.constraintsAddressed.length > 0 && (
                <div className="bg-surface rounded-[6px] p-6 border border-border">
                  <h3 className="text-[13px] font-medium text-data-5 mb-3">Constraints Addressed</h3>
                  <div className="space-y-2">
                    {scorecard.constraintsAddressed.map((c) => (
                      <div key={c.constraint} className="flex justify-between text-[14px]">
                        <span className="text-primary">{c.constraint.replace(/_/g, " ")}</span>
                        <span className="font-data text-data-5">{c.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {scorecard.constraintsMissed.length > 0 && (
                <div className="bg-surface rounded-[6px] p-6 border border-border">
                  <h3 className="text-[13px] font-medium text-data-4 mb-3">Constraints When Vendor Lost</h3>
                  <p className="text-[12px] text-muted mb-3">
                    Constraints in prompts where this vendor was mentioned but a competitor was chosen
                  </p>
                  <div className="space-y-2">
                    {scorecard.constraintsMissed.map((c) => (
                      <div key={c.constraint} className="flex justify-between text-[14px]">
                        <span className="text-primary">{c.constraint.replace(/_/g, " ")}</span>
                        <span className="font-data text-data-4">{c.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Competitive Landscape */}
        {scorecard.competitorWins.length > 0 && (
          <div>
            <h2 className="section-header mb-3">Competitive Landscape</h2>
            <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="th-label text-left px-4 py-3">Competitor</th>
                    <th className="th-label text-right px-4 py-3">Wins Over You</th>
                    <th className="th-label text-left px-4 py-3">Scenarios</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.competitorWins.map((comp) => (
                    <tr key={comp.competitor} className="border-b border-border-subtle hover:bg-raised">
                      <td className="px-4 py-2">
                        <Link
                          href={`/benchmarks/vendors/${encodeURIComponent(comp.competitor)}`}
                          className="text-accent hover:text-accent/80"
                        >
                          {vendorDisplayName(comp.competitor)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right font-data text-data-4 font-medium">{comp.count.toLocaleString()}</td>
                      <td className="px-4 py-2 text-secondary text-[12px]">
                        {comp.scenarios.map((s) => PROMPT_SUMMARIES[s]?.title || s).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Head to head detail with top competitor */}
            {h2h && h2h.scenarios.length > 0 && (
              <div className="mt-4 bg-surface rounded-[6px] p-6 border border-border">
                <h3 className="text-[14px] font-medium text-primary mb-3">
                  Head-to-Head: {vendorDisplayName(vendorId)} vs {vendorDisplayName(h2h.vendorB)}
                </h3>
                <div className="flex gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-data-1" />
                    <span className="text-[14px] text-primary">{vendorDisplayName(vendorId)}: <span className="font-data">{h2h.aWins}</span> win{h2h.aWins !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-data-4" />
                    <span className="text-[14px] text-primary">{vendorDisplayName(h2h.vendorB)}: <span className="font-data">{h2h.bWins}</span> win{h2h.bWins !== 1 ? "s" : ""}</span>
                  </div>
                  {h2h.ties > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-data-muted" />
                      <span className="text-[14px] text-primary">Ties: <span className="font-data">{h2h.ties}</span></span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {h2h.scenarios.map((s, i) => {
                    const prompt = PROMPT_SUMMARIES[s.prompt_id];
                    return (
                      <div key={i} className="flex items-start gap-3 text-[14px]">
                        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                          s.winner === vendorId ? "bg-data-1" :
                          s.winner === h2h.vendorB ? "bg-data-4" :
                          "bg-data-muted"
                        }`} />
                        <div>
                          <Link
                            href={`/benchmarks/${s.category}`}
                            className="text-primary hover:text-accent transition-colors"
                          >
                            {prompt?.title || s.prompt_id}
                          </Link>
                          {s.winner && (
                            <span className="text-[12px] text-muted ml-2">
                              &rarr; {vendorDisplayName(s.winner)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scenarios Won & Lost */}
        <div>
          <h2 className="section-header mb-3">Scenarios</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scorecard.promptsWon.length > 0 && (
              <div className="bg-surface rounded-[6px] p-6 border border-border">
                <h3 className="text-[13px] font-medium text-data-5 mb-3">
                  Scenarios Won ({scorecard.promptsWon.length.toLocaleString()})
                </h3>
                <div className="space-y-2">
                  {scorecard.promptsWon.map((p, i) => {
                    const prompt = PROMPT_SUMMARIES[p.prompt_id];
                    const catMeta = CATEGORY_META[p.category];
                    return (
                      <div key={i} className="text-[14px]">
                        <Link
                          href={`/benchmarks/${p.category}`}
                          className="text-primary hover:text-accent transition-colors"
                        >
                          {prompt?.title || p.prompt_id}
                        </Link>
                        {catMeta && (
                          <span className="text-[12px] text-muted ml-2">{catMeta.icon} {catMeta.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {scorecard.promptsLost.length > 0 && (
              <div className="bg-surface rounded-[6px] p-6 border border-border">
                <h3 className="text-[13px] font-medium text-data-4 mb-3">
                  Scenarios Lost ({scorecard.promptsLost.length.toLocaleString()})
                </h3>
                <div className="space-y-2">
                  {scorecard.promptsLost.map((p, i) => {
                    const prompt = PROMPT_SUMMARIES[p.prompt_id];
                    return (
                      <div key={i} className="text-[14px]">
                        <Link
                          href={`/benchmarks/${p.category}`}
                          className="text-primary hover:text-accent transition-colors"
                        >
                          {prompt?.title || p.prompt_id}
                        </Link>
                        <span className="text-[12px] text-muted ml-2">
                          &rarr; lost to{" "}
                          <Link
                            href={`/benchmarks/vendors/${encodeURIComponent(p.winner)}`}
                            className="text-data-4 hover:text-data-4/80"
                          >
                            {vendorDisplayName(p.winner)}
                          </Link>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Trade-offs & Gotchas */}
        {(scorecard.tradeOffSnippets.length > 0 || scorecard.gotchaSnippets.length > 0) && (
          <div>
            <h2 className="section-header mb-3">Trade-offs &amp; Gotchas Cited</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scorecard.tradeOffSnippets.length > 0 && (
                <div className="bg-surface rounded-[6px] p-6 border border-border">
                  <h3 className="text-[13px] font-medium text-data-3 mb-3">Trade-offs</h3>
                  <div className="space-y-3">
                    {scorecard.tradeOffSnippets.map((s, i) => (
                      <p key={i} className="text-[14px] text-primary border-l-2 border-data-3 pl-3">
                        {s}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {scorecard.gotchaSnippets.length > 0 && (
                <div className="bg-surface rounded-[6px] p-6 border border-border">
                  <h3 className="text-[13px] font-medium text-data-4 mb-3">Gotchas</h3>
                  <div className="space-y-3">
                    {scorecard.gotchaSnippets.map((s, i) => (
                      <p key={i} className="text-[14px] text-primary border-l-2 border-data-4 pl-3">
                        {s}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rationale */}
        {scorecard.rationaleSnippets.length > 0 && (
          <div>
            <h2 className="section-header mb-3">Why AI Detects This Vendor</h2>
            <div className="bg-surface rounded-[6px] p-6 border border-border space-y-3">
              {scorecard.rationaleSnippets.map((s, i) => (
                <p key={i} className="text-[14px] text-primary border-l-2 border-accent pl-3">
                  {s}
                </p>
              ))}
            </div>
          </div>
        )}

        </div>
      </TabPanel>

      {/* ── Actions: Actionable Recommendations ─────────────────────── */}
      {recommendations.length > 0 && (
        <TabPanel id="actions">
          <div>
            <h2 className="section-header mb-3">
              Actionable Signals
            </h2>
            <p className="text-[12px] text-muted mb-4">
              Prioritized by estimated impact on AI detection ranking. Based on {scorecard.totalMentions.toLocaleString()} benchmark responses.
            </p>
            <div className="space-y-3">
              {recommendations.slice(0, 5).map((rec, i) => (
                <RecommendationCard key={i} rec={rec} index={i} />
              ))}
            </div>

            {recommendations.length > 5 && (
              <details className="mt-3">
                <summary className="text-[14px] text-muted cursor-pointer hover:text-secondary px-4">
                  Show {recommendations.length - 5} more signal{recommendations.length - 5 > 1 ? "s" : ""}
                </summary>
                <div className="space-y-3 mt-3">
                  {recommendations.slice(5).map((rec, i) => (
                    <RecommendationCard key={i + 5} rec={rec} index={i + 5} />
                  ))}
                </div>
              </details>
            )}
          </div>
        </TabPanel>
      )}
      </TabbedView>
      </VendorGuard>
    </div>
  );
}
