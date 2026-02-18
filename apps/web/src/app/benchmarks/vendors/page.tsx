import Link from "next/link";
import { getAllVendorNames, getAllVendorTrends, getVendorScorecard } from "@/lib/db";
import { computeAIReadinessScore } from "@/lib/recommendations";
import { vendorDisplayName, vendorCategory, VENDOR_META } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PlatformBadge } from "@/components/PlatformBadge";
import { CATEGORY_META } from "../categories";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function VendorIndexPage() {
  const vendors = getAllVendorNames();
  const trends = getAllVendorTrends();

  // Group vendors: those with recommendations first, then those only mentioned
  const recommended = vendors.filter((v) => v.totalRecommendations > 0);
  const mentionedOnly = vendors.filter((v) => v.totalRecommendations === 0 && v.totalMentions > 0);

  // Compute AI-Readiness scores for vendors with enough data
  const aiReadinessScores: Array<{ vendor: string; score: number; grade: string; gradeColor: string }> = [];
  for (const v of recommended) {
    const scorecard = getVendorScorecard(v.vendor);
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
        <h1 className="text-2xl font-bold">Vendor Intelligence</h1>
        <p className="text-gray-400 mt-1">
          Per-vendor scorecards showing recommendation rates, constraint coverage,
          competitive dynamics, and actionable improvement recommendations
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Vendors Tracked</p>
          <p className="text-2xl font-bold mt-1">{vendors.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Primary Recommendations</p>
          <p className="text-2xl font-bold mt-1">{recommended.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Mentioned Only</p>
          <p className="text-2xl font-bold mt-1">{mentionedOnly.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Avg Win Rate</p>
          <p className="text-2xl font-bold mt-1">
            {recommended.length > 0
              ? `${Math.round(
                  (recommended.reduce((sum, v) => sum + v.winRate, 0) / recommended.length) * 100
                )}%`
              : "—"}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Top AI-Readiness</p>
          <p className="text-2xl font-bold mt-1">
            {aiReadinessScores.length > 0 ? (
              <span className={aiReadinessScores[0].gradeColor}>{aiReadinessScores[0].score}</span>
            ) : "—"}
          </p>
        </div>
      </div>

      {/* Movers section */}
      {(gainers.length > 0 || losers.length > 0) && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Movers
            <span className="text-sm font-normal text-gray-500 ml-2">
              Vendors gaining or losing AI recommendation share
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gainers.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-green-400 mb-3">↑ Gaining Share</h3>
                <div className="space-y-3">
                  {gainers.map((t) => (
                    <div key={t.vendor} className="flex items-center justify-between">
                      <Link
                        href={`/benchmarks/vendors/${encodeURIComponent(t.vendor)}`}
                        className="text-sm text-gray-200 hover:text-blue-400"
                      >
                        {vendorDisplayName(t.vendor)}
                      </Link>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">
                          {pct(t.previousWinRate)} → {pct(t.currentWinRate)}
                        </span>
                        <span className="text-sm font-medium text-green-400">
                          +{pct(t.winRateDelta)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {losers.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-red-400 mb-3">↓ Losing Share</h3>
                <div className="space-y-3">
                  {losers.map((t) => (
                    <div key={t.vendor} className="flex items-center justify-between">
                      <Link
                        href={`/benchmarks/vendors/${encodeURIComponent(t.vendor)}`}
                        className="text-sm text-gray-200 hover:text-blue-400"
                      >
                        {vendorDisplayName(t.vendor)}
                      </Link>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">
                          {pct(t.previousWinRate)} → {pct(t.currentWinRate)}
                        </span>
                        <span className="text-sm font-medium text-red-400">
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
          <h2 className="text-lg font-semibold mb-1">
            AI-Readiness Leaderboard
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            How well each vendor&apos;s documentation and SDK helps AI assistants recommend and implement it
          </p>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-4 py-3 w-8">#</th>
                  <th className="text-left px-4 py-3">Vendor</th>
                  <th className="text-right px-4 py-3">Score</th>
                  <th className="text-center px-4 py-3">Grade</th>
                  <th className="px-4 py-3 w-40"></th>
                </tr>
              </thead>
              <tbody>
                {aiReadinessScores.slice(0, 15).map((entry, i) => (
                  <tr key={entry.vendor} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/benchmarks/vendors/${encodeURIComponent(entry.vendor)}`}
                        className="text-gray-200 hover:text-blue-400"
                      >
                        {vendorDisplayName(entry.vendor)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-bold">
                      <span className={entry.gradeColor}>{entry.score}</span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`font-bold ${entry.gradeColor}`}>{entry.grade}</span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            entry.score >= 70 ? "bg-green-500" :
                            entry.score >= 40 ? "bg-yellow-500" :
                            "bg-red-500"
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
          <h2 className="text-lg font-semibold mb-3">
            Primary Recommendations
            <span className="text-sm font-normal text-gray-500 ml-2">
              Vendors chosen as the top recommendation in at least one scenario
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {recommended.map((v) => {
              const catMeta = v.topCategory ? CATEGORY_META[v.topCategory] : null;
              return (
                <Link
                  key={v.vendor}
                  href={`/benchmarks/vendors/${encodeURIComponent(v.vendor)}`}
                  className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700/80 hover:ring-1 hover:ring-gray-600 transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-100 group-hover:text-blue-400 transition-colors">
                        {vendorDisplayName(v.vendor)}
                      </h3>
                      {VENDOR_META[v.vendor]?.website && (
                        <p className="text-xs text-gray-500">{VENDOR_META[v.vendor].website}</p>
                      )}
                    </div>
                    <span className="text-2xl font-bold text-blue-400">
                      {v.totalRecommendations}
                    </span>
                  </div>

                  {catMeta && (
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-xs">{catMeta.icon}</span>
                      <span className="text-xs text-gray-400">{catMeta.label}</span>
                    </div>
                  )}

                  <div className="space-y-1.5 mt-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Win rate</span>
                      <span className="text-gray-300">{Math.round(v.winRate * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${Math.round(v.winRate * 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Implementation rate</span>
                      <span className="text-gray-300">{Math.round(v.implementationRate * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${
                          v.implementationRate > 0.5 ? "bg-green-500" : v.implementationRate > 0.2 ? "bg-yellow-500" : "bg-red-500"
                        }`}
                        style={{ width: `${Math.max(4, Math.round(v.implementationRate * 100))}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Total mentions</span>
                      <span className="text-gray-400">{v.totalMentions}</span>
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
          <h2 className="text-lg font-semibold mb-3">
            Mentioned but Not Recommended
            <span className="text-sm font-normal text-gray-500 ml-2">
              Vendors appearing in responses but never selected as the primary recommendation
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {mentionedOnly.map((v) => {
              const catMeta = v.topCategory ? CATEGORY_META[v.topCategory] : null;
              return (
                <Link
                  key={v.vendor}
                  href={`/benchmarks/vendors/${encodeURIComponent(v.vendor)}`}
                  className="bg-gray-800/50 border border-dashed border-gray-700 rounded-lg p-4 hover:border-gray-500 hover:bg-gray-800/70 transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-300 group-hover:text-blue-400 transition-colors">
                      {vendorDisplayName(v.vendor)}
                    </h3>
                    <span className="text-sm text-gray-500">
                      {v.totalMentions} mention{v.totalMentions !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {catMeta && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs">{catMeta.icon}</span>
                      <span className="text-xs text-gray-500">{catMeta.label}</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {vendors.length === 0 && (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
          <p className="text-lg">No vendor data yet</p>
          <p className="text-sm mt-2">
            Run benchmark sessions to generate vendor intelligence data
          </p>
        </div>
      )}
    </div>
  );
}
