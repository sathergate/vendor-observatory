import Link from "next/link";
import { getVendorScorecard, getVendorHeadToHead, getVendorTrend } from "@/lib/db";
import { generateRecommendations, computeAIReadinessScore, type Recommendation } from "@/lib/recommendations";
import { vendorDisplayName, VENDOR_META, vendorCategory } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { TabbedView, TabPanel } from "@/components/TabbedView";
import { VendorGuard } from "@/components/VendorGuard";
import { loadCategoryMeta } from "../../categories";
import { PROMPT_SUMMARIES } from "../../prompt-summaries";
import { FLAGS } from "@/lib/flags";

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
      <TabbedView sections={FLAGS.VENDOR_SURFACE_V2 ? [
        { id: "fixes", label: "Fixes Now" },
        { id: "why-lose", label: "Why You Lose" },
        { id: "where-win", label: "Where You Win" },
        { id: "competitive", label: "Competitive Evidence" },
        { id: "raw-evidence", label: "Raw Evidence" },
      ] : [
        { id: "overview", label: "Overview" },
        { id: "signals", label: "Signals" },
        ...(recommendations.length > 0 ? [{ id: "actions", label: "Actions" }] : []),
      ]}>

      {/* ── V2: Headline Diagnosis ────────────────────────────────────── */}
      {FLAGS.VENDOR_SURFACE_V2 && (
        <div className="bg-surface rounded-[6px] p-6 border border-border mb-6">
          <p className="text-[15px] text-primary leading-relaxed">
            {vendorDisplayName(vendorId)} is recommended in{" "}
            <span className="font-data text-accent">{pct(scorecard.winRate)}</span> of
            scenarios ({scorecard.totalRecommendations.toLocaleString()} of{" "}
            {scorecard.totalMentions.toLocaleString()} conversations).
            {scorecard.implementationRate > 0 && (
              <> Implementation conversion is{" "}
              <span className={`font-data ${scorecard.implementationRate > 0.6 ? "text-data-5" : scorecard.implementationRate > 0.3 ? "text-data-3" : "text-data-4"}`}>
                {pct(scorecard.implementationRate)}
              </span>.
              </>
            )}
            {scorecard.competitorWins.length > 0 && (
              <> Top competitor:{" "}
              <Link href={`/benchmarks/vendors/${encodeURIComponent(scorecard.competitorWins[0].competitor)}`} className="text-accent hover:text-accent/80">
                {vendorDisplayName(scorecard.competitorWins[0].competitor)}
              </Link>{" "}
              ({scorecard.competitorWins[0].count} wins).
              </>
            )}
          </p>
        </div>
      )}

      {/* ── V2: Fixes Now (DEFAULT) ───────────────────────────────────── */}
      {FLAGS.VENDOR_SURFACE_V2 && (
        <TabPanel id="fixes">
          <div>
            <h2 className="section-header mb-3">Fixes Now</h2>
            <p className="text-[12px] text-muted mb-4">
              Prioritized by estimated impact. Based on {scorecard.totalMentions.toLocaleString()} benchmark responses.
            </p>
            {recommendations.length > 0 ? (
              <div className="space-y-3">
                {recommendations.map((rec, i) => (
                  <RecommendationCard key={i} rec={rec} index={i} />
                ))}
              </div>
            ) : (
              <div className="quiet-signal">
                <p className="text-secondary text-[14px]">No actionable fixes identified yet.</p>
              </div>
            )}
          </div>
        </TabPanel>
      )}

      {/* ── V2: Why You Lose ──────────────────────────────────────────── */}
      {FLAGS.VENDOR_SURFACE_V2 && (
        <TabPanel id="why-lose">
          <div className="space-y-8">
            {/* Competitive Landscape */}
            {scorecard.competitorWins.length > 0 && (
              <div>
                <h2 className="section-header mb-3">Competitors Winning Against You</h2>
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
                            <Link href={`/benchmarks/vendors/${encodeURIComponent(comp.competitor)}`} className="text-accent hover:text-accent/80">
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
              </div>
            )}

            {/* Scenarios Lost */}
            {scorecard.promptsLost.length > 0 && (
              <div>
                <h2 className="section-header mb-3">Scenarios Lost ({scorecard.promptsLost.length})</h2>
                <div className="bg-surface rounded-[6px] p-6 border border-border space-y-2">
                  {scorecard.promptsLost.map((p, i) => (
                    <div key={i} className="text-[14px]">
                      <Link href={`/benchmarks/${p.category}`} className="text-primary hover:text-accent transition-colors">
                        {PROMPT_SUMMARIES[p.prompt_id]?.title || p.prompt_id}
                      </Link>
                      <span className="text-[12px] text-muted ml-2">
                        &rarr; lost to{" "}
                        <Link href={`/benchmarks/vendors/${encodeURIComponent(p.winner)}`} className="text-data-4 hover:text-data-4/80">
                          {vendorDisplayName(p.winner)}
                        </Link>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Constraints missed */}
            {scorecard.constraintsMissed.length > 0 && (
              <div>
                <h2 className="section-header mb-3">Constraints When You Lose</h2>
                <div className="bg-surface rounded-[6px] p-6 border border-border space-y-2">
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
        </TabPanel>
      )}

      {/* ── V2: Where You Win ─────────────────────────────────────────── */}
      {FLAGS.VENDOR_SURFACE_V2 && (
        <TabPanel id="where-win">
          <div className="space-y-8">
            {/* Scenarios Won */}
            {scorecard.promptsWon.length > 0 && (
              <div>
                <h2 className="section-header mb-3">Scenarios Won ({scorecard.promptsWon.length})</h2>
                <div className="bg-surface rounded-[6px] p-6 border border-border space-y-2">
                  {scorecard.promptsWon.map((p, i) => {
                    const catMeta = CATEGORY_META[p.category];
                    return (
                      <div key={i} className="text-[14px]">
                        <Link href={`/benchmarks/${p.category}`} className="text-primary hover:text-accent transition-colors">
                          {PROMPT_SUMMARIES[p.prompt_id]?.title || p.prompt_id}
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

            {/* Constraints Addressed */}
            {scorecard.constraintsAddressed.length > 0 && (
              <div>
                <h2 className="section-header mb-3">Constraints You Address</h2>
                <div className="bg-surface rounded-[6px] p-6 border border-border space-y-2">
                  {scorecard.constraintsAddressed.map((c) => (
                    <div key={c.constraint} className="flex justify-between text-[14px]">
                      <span className="text-primary">{c.constraint.replace(/_/g, " ")}</span>
                      <span className="font-data text-data-5">{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category Breakdown */}
            {scorecard.categoryBreakdown.length > 0 && (
              <div>
                <h2 className="section-header mb-3">Category Performance</h2>
                <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="th-label text-left px-4 py-3">Category</th>
                        <th className="th-label text-right px-4 py-3">Detected</th>
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
                            <td className="px-4 py-2 text-right font-data text-secondary">{cat.totalInCategory.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right">
                              <span className={`font-data font-medium ${wr > 0.6 ? "text-data-5" : wr > 0.3 ? "text-data-3" : "text-data-4"}`}>
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
          </div>
        </TabPanel>
      )}

      {/* ── V2: Competitive Evidence ──────────────────────────────────── */}
      {FLAGS.VENDOR_SURFACE_V2 && (
        <TabPanel id="competitive">
          <div className="space-y-8">
            {h2h && h2h.scenarios.length > 0 && (
              <div>
                <h2 className="section-header mb-3">
                  Head-to-Head: {vendorDisplayName(vendorId)} vs {vendorDisplayName(h2h.vendorB)}
                </h2>
                <div className="bg-surface rounded-[6px] p-6 border border-border">
                  <div className="flex gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-data-1" />
                      <span className="text-[14px] text-primary">{vendorDisplayName(vendorId)}: <span className="font-data">{h2h.aWins}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-data-4" />
                      <span className="text-[14px] text-primary">{vendorDisplayName(h2h.vendorB)}: <span className="font-data">{h2h.bWins}</span></span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {h2h.scenarios.map((s, i) => (
                      <div key={i} className="flex items-start gap-3 text-[14px]">
                        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                          s.winner === vendorId ? "bg-data-1" : s.winner === h2h.vendorB ? "bg-data-4" : "bg-data-muted"
                        }`} />
                        <div>
                          <Link href={`/benchmarks/${s.category}`} className="text-primary hover:text-accent transition-colors">
                            {PROMPT_SUMMARIES[s.prompt_id]?.title || s.prompt_id}
                          </Link>
                          {s.winner && (
                            <span className="text-[12px] text-muted ml-2">&rarr; {vendorDisplayName(s.winner)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Platform presence */}
            {Object.keys(scorecard.platformSplit).length > 0 && (
              <div>
                <h2 className="section-header mb-3">Platform Presence</h2>
                <div className="flex gap-3">
                  {Object.entries(scorecard.platformSplit)
                    .sort(([, a], [, b]) => b - a)
                    .map(([platform, count]) => (
                    <div key={platform} className="bg-surface rounded-[6px] p-4 border border-border flex-1">
                      <p className="text-[12px] text-muted">{platform.replace(/_/g, " ")}</p>
                      <p className="font-data text-[20px] text-primary mt-1">{count}</p>
                      <p className="text-[12px] text-muted">recommendations</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabPanel>
      )}

      {/* ── V2: Raw Evidence ──────────────────────────────────────────── */}
      {FLAGS.VENDOR_SURFACE_V2 && (
        <TabPanel id="raw-evidence">
          <div className="space-y-8">
            {scorecard.rationaleSnippets.length > 0 && (
              <div>
                <h2 className="section-header mb-3">Why AI Detects This Vendor</h2>
                <div className="bg-surface rounded-[6px] p-6 border border-border space-y-3">
                  {scorecard.rationaleSnippets.map((s, i) => (
                    <p key={i} className="text-[14px] text-primary border-l-2 border-accent pl-3">{s}</p>
                  ))}
                </div>
              </div>
            )}

            {scorecard.tradeOffSnippets.length > 0 && (
              <div>
                <h2 className="section-header mb-3">Trade-offs</h2>
                <div className="bg-surface rounded-[6px] p-6 border border-border space-y-3">
                  {scorecard.tradeOffSnippets.map((s, i) => (
                    <p key={i} className="text-[14px] text-primary border-l-2 border-data-3 pl-3">{s}</p>
                  ))}
                </div>
              </div>
            )}

            {scorecard.gotchaSnippets.length > 0 && (
              <div>
                <h2 className="section-header mb-3">Gotchas</h2>
                <div className="bg-surface rounded-[6px] p-6 border border-border space-y-3">
                  {scorecard.gotchaSnippets.map((s, i) => (
                    <p key={i} className="text-[14px] text-primary border-l-2 border-data-4 pl-3">{s}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabPanel>
      )}

      {/* ── Legacy V1: Overview ───────────────────────────────────────── */}
      {!FLAGS.VENDOR_SURFACE_V2 && (
      <TabPanel id="overview">
        <div className="space-y-8">

        {/* ── Your Reach ─────────────────────────────────────────────── */}
        <div>
          <h2 className="section-header mb-3">Your reach</h2>
          <p className="text-[14px] text-secondary mb-4">
            Across {scorecard.totalMentions.toLocaleString()} AI conversations,
            {" "}{vendorDisplayName(vendorId)} was the recommended choice{" "}
            <span className="font-data text-accent">{scorecard.totalRecommendations.toLocaleString()}</span> times.
            {scorecard.implementationRate > 0 && (
              <> When recommended, developers wrote integration code{" "}
              <span className="font-data text-data-5">{pct(scorecard.implementationRate)}</span> of the time.</>
            )}
          </p>

          {/* Platform presence */}
          {Object.keys(scorecard.platformSplit).length > 0 && (
            <div className="flex gap-3">
              {Object.entries(scorecard.platformSplit)
                .sort(([, a], [, b]) => b - a)
                .map(([platform, count]) => (
                <div key={platform} className="bg-surface rounded-[6px] p-4 border border-border flex-1">
                  <p className="text-[12px] text-muted">{platform.replace(/_/g, " ")}</p>
                  <p className="font-data text-[20px] text-primary mt-1">{count}</p>
                  <p className="text-[12px] text-muted">recommendations</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Opportunity Map ────────────────────────────────────────── */}
        <div>
          <h2 className="section-header mb-3">Where you can grow</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Scenarios you're winning vs total */}
            <Link href={`/benchmarks/vendors/${encodeURIComponent(vendorId)}/use-cases`} className="bg-surface rounded-[6px] p-6 border border-border hover:border-accent/40 transition-colors block">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-[13px] text-primary font-medium">Scenarios won</p>
                <p className="font-data text-[14px] text-accent">
                  {scorecard.promptsWon.length} of {scorecard.promptsWon.length + scorecard.promptsLost.length}
                </p>
              </div>
              <div className="w-full bg-data-muted rounded-[6px] h-3">
                <div
                  className="h-3 rounded-[6px] bg-accent"
                  style={{ width: `${Math.max(2, (scorecard.promptsWon.length / Math.max(scorecard.promptsWon.length + scorecard.promptsLost.length, 1)) * 100)}%` }}
                />
              </div>
              {scorecard.promptsLost.length > 0 && (
                <p className="text-[12px] text-muted mt-2">
                  {scorecard.promptsLost.length} scenario{scorecard.promptsLost.length !== 1 ? "s" : ""} where
                  a competitor was chosen instead
                </p>
              )}
            </Link>

            {/* Requirements coverage */}
            {(scorecard.constraintsAddressed.length > 0 || scorecard.constraintsMissed.length > 0) && (
              <Link href={`/benchmarks/vendors/${encodeURIComponent(vendorId)}/implementation`} className="bg-surface rounded-[6px] p-6 border border-border hover:border-accent/40 transition-colors block">
                <div className="flex items-baseline justify-between mb-3">
                  <p className="text-[13px] text-primary font-medium">Developer requirements covered</p>
                  <p className="font-data text-[14px] text-accent">
                    {scorecard.constraintsAddressed.length} of {scorecard.constraintsAddressed.length + scorecard.constraintsMissed.length}
                  </p>
                </div>
                <div className="w-full bg-data-muted rounded-[6px] h-3">
                  <div
                    className="h-3 rounded-[6px] bg-accent"
                    style={{ width: `${Math.max(2, (scorecard.constraintsAddressed.length / Math.max(scorecard.constraintsAddressed.length + scorecard.constraintsMissed.length, 1)) * 100)}%` }}
                  />
                </div>
                {scorecard.constraintsMissed.length > 0 && (
                  <p className="text-[12px] text-muted mt-2">
                    {scorecard.constraintsMissed.length} requirement{scorecard.constraintsMissed.length !== 1 ? "s" : ""} that
                    developers asked for where AI didn&apos;t know you qualified
                  </p>
                )}
              </Link>
            )}

            {/* Competitors winning against you */}
            {scorecard.competitorWins.length > 0 && (
              <Link href={`/benchmarks/vendors/${encodeURIComponent(vendorId)}/competitive`} className="bg-surface rounded-[6px] p-6 border border-border hover:border-accent/40 transition-colors block">
                <p className="text-[13px] text-primary font-medium mb-3">Top competitors winning scenarios</p>
                <div className="space-y-2">
                  {scorecard.competitorWins.slice(0, 3).map((comp) => (
                    <div key={comp.competitor} className="flex items-center justify-between text-[14px]">
                      <span className="text-secondary">
                        {vendorDisplayName(comp.competitor)}
                      </span>
                      <span className="font-data text-secondary">{comp.count} win{comp.count !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
              </Link>
            )}

            {/* Clean recommendation rate */}
            <Link href={`/benchmarks/vendors/${encodeURIComponent(vendorId)}/reasoning`} className="bg-surface rounded-[6px] p-6 border border-border hover:border-accent/40 transition-colors block">
              <p className="text-[13px] text-primary font-medium mb-2">Warnings flagged by AI</p>
              {scorecard.gotchaSnippets.length > 0 ? (
                <>
                  <p className="font-data text-[20px] text-data-3">{scorecard.gotchaSnippets.length}</p>
                  <p className="text-[12px] text-muted mt-1">
                    AI added caveats when recommending you
                  </p>
                </>
              ) : (
                <>
                  <p className="font-data text-[20px] text-data-5">0</p>
                  <p className="text-[12px] text-muted mt-1">
                    AI recommends you without caveats
                  </p>
                </>
              )}
            </Link>
          </div>
        </div>

        {/* ── Momentum ───────────────────────────────────────────────── */}
        {trend && trend.dataPoints.length > 0 && (
          <div>
            <h2 className="section-header mb-3">Momentum</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-surface rounded-[6px] p-6 border border-border">
                <p className="stat-label">Selection rate</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={`font-data text-[24px] ${
                    trend.trend === "rising" ? "text-data-5" :
                    trend.trend === "falling" ? "text-data-4" :
                    "text-secondary"
                  }`}>
                    {pct(trend.currentWinRate)}
                  </span>
                  <span className={`font-data text-[14px] ${
                    trend.winRateDelta >= 0 ? "text-data-5" : "text-data-4"
                  }`}>
                    {trend.winRateDelta >= 0 ? "+" : ""}{pct(trend.winRateDelta)}
                  </span>
                </div>
                <p className="stat-context mt-1">
                  was {pct(trend.previousWinRate)} last period
                </p>
              </div>
              <div className="bg-surface rounded-[6px] p-6 border border-border">
                <p className="stat-label">Conversations this period</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="font-data text-[24px] text-primary">
                    {trend.currentMentions.toLocaleString()}
                  </span>
                  <span className={`font-data text-[14px] ${
                    trend.mentionDelta >= 0 ? "text-data-5" : "text-data-4"
                  }`}>
                    {trend.mentionDelta >= 0 ? "+" : ""}{trend.mentionDelta}
                  </span>
                </div>
              </div>
              <div className="bg-surface rounded-[6px] p-6 border border-border">
                <p className="stat-label">Weekly activity</p>
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
      )}

      {/* ── Legacy V1: Signals ────────────────────────────────────────── */}
      {!FLAGS.VENDOR_SURFACE_V2 && (
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
      )}

      {/* ── Legacy V1: Actions ────────────────────────────────────────── */}
      {!FLAGS.VENDOR_SURFACE_V2 && recommendations.length > 0 && (
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
