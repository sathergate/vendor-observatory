import Link from "next/link";
import { getAllVendorNames, getAllVendorTrends, getAllVendorScorecards } from "@/lib/db";
import { computeAIReadinessScore } from "@/lib/recommendations";
import { vendorDisplayName, vendorCategory, VENDOR_META } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PlatformBadge } from "@/components/PlatformBadge";
import { loadCategoryMeta } from "../categories";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function VendorIndexPage() {
  const [vendors, trends, scorecards, CATEGORY_META] = await Promise.all([
    getAllVendorNames(),
    getAllVendorTrends(),
    getAllVendorScorecards(),
    loadCategoryMeta(),
  ]);

  // Group vendors: those with recommendations first, then those only mentioned
  const recommended = vendors.filter((v) => v.totalRecommendations > 0);
  const mentionedOnly = vendors.filter((v) => v.totalRecommendations === 0 && v.totalMentions > 0);

  // Index scorecards by vendor for O(1) lookup
  const scorecardMap = new Map(scorecards.map((s) => [s.vendor, s]));

  // Compute AI-Readiness scores for vendors with enough data
  const aiReadinessScores: Array<{ vendor: string; score: number; grade: string; gradeColor: string }> = [];
  for (const v of recommended) {
    const scorecard = scorecardMap.get(v.vendor);
    if (scorecard && scorecard.totalMentions >= 3) {
      const readiness = computeAIReadinessScore(scorecard);
      aiReadinessScores.push({
        vendor: v.vendor,
        score: readiness.overall,
        grade: readiness.grade,
        gradeColor: readiness.gradeColor,
      });
    }
  }
  aiReadinessScores.sort((a, b) => b.score - a.score);

  // Movers: top gainers and losers by win rate delta
  const gainers = trends
    .filter((t) => t.trend === "rising" && t.currentMentions >= 2)
    .sort((a, b) => b.winRateDelta - a.winRateDelta)
    .slice(0, 3);
  const losers = trends
    .filter((t) => t.trend === "falling" && t.currentMentions >= 2)
    .sort((a, b) => a.winRateDelta - b.winRateDelta)
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Vendor Intel" }]} />
        <h1 className="text-[24px] font-bold text-primary">Vendor Intelligence</h1>
        <p className="text-secondary mt-1">
          Per-vendor scorecards showing detection rates, constraint coverage,
          competitive dynamics, and improvement signals
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-surface rounded-[6px] p-6 border border-border">
          <p className="stat-label">Vendors Tracked</p>
          <p className="stat-hero mt-1">{vendors.length.toLocaleString()}</p>
        </div>
        <div className="bg-surface rounded-[6px] p-6 border border-border">
          <p className="stat-label">Primary Detections</p>
          <p className="stat-hero mt-1">{recommended.length.toLocaleString()}</p>
        </div>
        <div className="bg-surface rounded-[6px] p-6 border border-border">
          <p className="stat-label">Mentioned Only</p>
          <p className="stat-hero mt-1">{mentionedOnly.length.toLocaleString()}</p>
        </div>
        <div className="bg-surface rounded-[6px] p-6 border border-border">
          <p className="stat-label">Avg Win Rate</p>
          <p className="stat-hero mt-1">
            {recommended.length > 0
              ? `${((recommended.reduce((sum, v) => sum + v.winRate, 0) / recommended.length) * 100).toFixed(1)}%`
              : "\u2014"}
          </p>
        </div>
        <div className="bg-surface rounded-[6px] p-6 border border-border">
          <p className="stat-label">Top AI-Readiness</p>
          <p className="stat-hero mt-1">
            {aiReadinessScores.length > 0 ? (
              <span className="text-accent">{aiReadinessScores[0].score}</span>
            ) : "\u2014"}
          </p>
        </div>
      </div>

      {/* Movers section */}
      {(gainers.length > 0 || losers.length > 0) && (
        <div>
          <h2 className="section-header mb-1">
            Movers
          </h2>
          <p className="text-[14px] text-muted mb-3">
            Vendors gaining or losing AI signal share
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gainers.length > 0 && (
              <div className="bg-surface rounded-[6px] p-6 border border-border">
                <h3 className="text-[13px] font-medium text-data-5 mb-3">Gaining Share</h3>
                <div className="space-y-3">
                  {gainers.map((t) => (
                    <div key={t.vendor} className="flex items-center justify-between">
                      <Link
                        href={`/benchmarks/vendors/${encodeURIComponent(t.vendor)}`}
                        className="text-[14px] text-primary hover:text-accent"
                      >
                        {vendorDisplayName(t.vendor)}
                      </Link>
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] text-muted font-data">
                          {pct(t.previousWinRate)} &rarr; {pct(t.currentWinRate)}
                        </span>
                        <span className="text-[14px] font-data text-data-5">
                          +{pct(t.winRateDelta)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {losers.length > 0 && (
              <div className="bg-surface rounded-[6px] p-6 border border-border">
                <h3 className="text-[13px] font-medium text-data-4 mb-3">Losing Share</h3>
                <div className="space-y-3">
                  {losers.map((t) => (
                    <div key={t.vendor} className="flex items-center justify-between">
                      <Link
                        href={`/benchmarks/vendors/${encodeURIComponent(t.vendor)}`}
                        className="text-[14px] text-primary hover:text-accent"
                      >
                        {vendorDisplayName(t.vendor)}
                      </Link>
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] text-muted font-data">
                          {pct(t.previousWinRate)} &rarr; {pct(t.currentWinRate)}
                        </span>
                        <span className="text-[14px] font-data text-data-4">
                          {pct(t.winRateDelta)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI-Readiness Leaderboard */}
      {aiReadinessScores.length > 0 && (
        <div>
          <h2 className="section-header mb-1">
            AI-Readiness Leaderboard
          </h2>
          <p className="text-[14px] text-muted mb-3">
            How well each vendor&apos;s documentation and SDK helps AI assistants detect and implement it
          </p>
          <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="th-label text-left px-4 py-3 w-8">#</th>
                  <th className="th-label text-left px-4 py-3">Vendor</th>
                  <th className="th-label text-right px-4 py-3">Score</th>
                  <th className="th-label text-center px-4 py-3">Grade</th>
                  <th className="px-4 py-3 w-40"></th>
                </tr>
              </thead>
              <tbody>
                {aiReadinessScores.slice(0, 15).map((entry, i) => (
                  <tr key={entry.vendor} className="border-b border-border-subtle hover:bg-raised">
                    <td className="px-4 py-2 text-muted font-data">{i + 1}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/benchmarks/vendors/${encodeURIComponent(entry.vendor)}`}
                        className="text-primary hover:text-accent"
                      >
                        {vendorDisplayName(entry.vendor)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-data font-bold">
                      <span className="text-accent">{entry.score}</span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="font-data font-bold text-accent">{entry.grade}</span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="w-full bg-data-muted rounded-[6px] h-2">
                        <div
                          className={`h-2 rounded-[6px] ${
                            entry.score >= 70 ? "bg-data-5" :
                            entry.score >= 40 ? "bg-data-3" :
                            "bg-data-4"
                          }`}
                          style={{ width: `${Math.max(2, entry.score)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recommended vendors */}
      {recommended.length > 0 && (
        <div>
          <h2 className="section-header mb-1">
            Primary Detections
          </h2>
          <p className="text-[14px] text-muted mb-3">
            Vendors chosen as the top signal in at least one scenario
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {recommended.map((v) => {
              const catMeta = v.topCategory ? CATEGORY_META[v.topCategory] : null;
              return (
                <Link
                  key={v.vendor}
                  href={`/benchmarks/vendors/${encodeURIComponent(v.vendor)}`}
                  className="bg-surface rounded-[6px] p-4 border border-border hover:bg-raised hover:border-border transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-primary group-hover:text-accent transition-colors">
                        {vendorDisplayName(v.vendor)}
                      </h3>
                      {VENDOR_META[v.vendor]?.website && (
                        <p className="text-[12px] text-muted">{VENDOR_META[v.vendor].website}</p>
                      )}
                    </div>
                    <span className="font-data text-[24px] text-accent">
                      {v.totalRecommendations.toLocaleString()}
                    </span>
                  </div>

                  {catMeta && (
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-[12px]">{catMeta.icon}</span>
                      <span className="text-[12px] text-secondary">{catMeta.label}</span>
                    </div>
                  )}

                  <div className="space-y-1.5 mt-3">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-muted">Win rate</span>
                      <span className="font-data text-primary">{(v.winRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-data-muted rounded-[6px] h-1.5">
                      <div
                        className="bg-accent h-1.5 rounded-[6px]"
                        style={{ width: `${Math.round(v.winRate * 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[12px]">
                      <span className="text-muted">Implementation rate</span>
                      <span className="font-data text-primary">{(v.implementationRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-data-muted rounded-[6px] h-1.5">
                      <div
                        className={`h-1.5 rounded-[6px] ${
                          v.implementationRate > 0.5 ? "bg-data-5" : v.implementationRate > 0.2 ? "bg-data-3" : "bg-data-4"
                        }`}
                        style={{ width: `${Math.max(4, Math.round(v.implementationRate * 100))}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[12px]">
                      <span className="text-muted">Total mentions</span>
                      <span className="font-data text-secondary">{v.totalMentions.toLocaleString()}</span>
                    </div>

                    {v.platforms.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {v.platforms.map((p) => (
                          <PlatformBadge key={p} platform={p} size="xs" />
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Mentioned-only vendors */}
      {mentionedOnly.length > 0 && (
        <div>
          <h2 className="section-header mb-1">
            Mentioned but Not Detected as Primary
          </h2>
          <p className="text-[14px] text-muted mb-3">
            Vendors appearing in responses but never selected as the primary signal
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {mentionedOnly.map((v) => {
              const catMeta = v.topCategory ? CATEGORY_META[v.topCategory] : null;
              return (
                <Link
                  key={v.vendor}
                  href={`/benchmarks/vendors/${encodeURIComponent(v.vendor)}`}
                  className="bg-surface/50 border border-dashed border-border-subtle rounded-[6px] p-4 hover:border-border hover:bg-surface/70 transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-secondary group-hover:text-accent transition-colors">
                      {vendorDisplayName(v.vendor)}
                    </h3>
                    <span className="text-[14px] text-muted font-data">
                      {v.totalMentions.toLocaleString()} mention{v.totalMentions !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {catMeta && (
                    <div className="flex items-center gap-1">
                      <span className="text-[12px]">{catMeta.icon}</span>
                      <span className="text-[12px] text-muted">{catMeta.label}</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {vendors.length === 0 && (
        <div className="quiet-signal">
          <p className="text-[16px] text-secondary">No vendor data yet</p>
          <p className="text-[14px] mt-2 text-muted">
            Run benchmark sessions to generate vendor intelligence data
          </p>
        </div>
      )}
    </div>
  );
}
