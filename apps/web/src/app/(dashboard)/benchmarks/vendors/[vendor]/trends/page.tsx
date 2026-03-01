import { getVendorTrend } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SectionNav } from "@/components/SectionNav";
import { VendorGuard } from "@/components/VendorGuard";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default async function TrendsPage({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor } = await params;
  const vendorId = decodeURIComponent(vendor);
  const trend = await getVendorTrend(vendorId);

  return (
    <div className="space-y-8">
      <Breadcrumb items={[
        { label: "Home", href: "/" },
        { label: vendorDisplayName(vendorId), href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}` },
        { label: "Confidence Trends" },
      ]} />

      <VendorGuard vendorId={vendorId}>
        <h1 className="text-2xl font-bold">Confidence Trends</h1>

        {!trend || trend.dataPoints.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
            <p>No trend data available yet.</p>
          </div>
        ) : (
          <>
            <SectionNav sections={[
              { id: "trend-kpis", label: "KPIs" },
              { id: "activity", label: "Activity" },
              { id: "weekly-data", label: "Weekly Data" },
            ]} />

            {/* Trend KPIs */}
            <div id="trend-kpis">
              <h2 className="text-lg font-semibold mb-3">Trend Overview</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Win Rate Trend</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold">
                      {trend.trend === "rising" ? "\u2191" : trend.trend === "falling" ? "\u2193" : "\u2192"}
                    </span>
                    <span className={`text-xl font-bold ${
                      trend.trend === "rising" ? "text-green-400" :
                      trend.trend === "falling" ? "text-red-400" :
                      "text-gray-400"
                    }`}>
                      {trend.winRateDelta >= 0 ? "+" : ""}{pct(trend.winRateDelta)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {pct(trend.previousWinRate)} → {pct(trend.currentWinRate)}
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Current Win Rate</p>
                  <p className={`text-2xl font-bold mt-1 ${
                    trend.currentWinRate > 0.6 ? "text-green-400" :
                    trend.currentWinRate > 0.3 ? "text-yellow-400" : "text-red-400"
                  }`}>
                    {pct(trend.currentWinRate)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">vs prior: {pct(trend.previousWinRate)}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Mention Volume</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className={`text-2xl font-bold ${
                      trend.mentionDelta > 0 ? "text-green-400" :
                      trend.mentionDelta < 0 ? "text-red-400" :
                      "text-gray-400"
                    }`}>
                      {trend.currentMentions}
                    </span>
                    <span className="text-sm text-gray-500">
                      ({trend.mentionDelta >= 0 ? "+" : ""}{trend.mentionDelta} vs prior)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sparkline */}
            <div id="activity">
              <h2 className="text-lg font-semibold mb-3">Weekly Activity</h2>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-end gap-1 h-24">
                  {trend.dataPoints.map((dp, i) => {
                    const maxMentions = Math.max(...trend.dataPoints.map(p => p.mentions), 1);
                    const height = Math.max(4, (dp.mentions / maxMentions) * 96);
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${
                          dp.winRate > 0.5 ? "bg-green-500/70" :
                          dp.winRate > 0 ? "bg-yellow-500/70" :
                          "bg-gray-600"
                        }`}
                        style={{ height: `${height}px` }}
                        title={`${dp.weekStart}: ${dp.mentions} mentions, ${pct(dp.winRate)} win rate`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-gray-600 mt-2">
                  <span>{trend.dataPoints[0]?.weekStart}</span>
                  <span>{trend.dataPoints[trend.dataPoints.length - 1]?.weekStart}</span>
                </div>
                <div className="flex gap-3 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-green-500/70" /> Win rate &gt; 50%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-yellow-500/70" /> Win rate &gt; 0%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-gray-600" /> No wins
                  </span>
                </div>
              </div>
            </div>

            {/* Raw Data Table */}
            <div id="weekly-data">
              <h2 className="text-lg font-semibold mb-3">Weekly Breakdown</h2>
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-400">
                      <th className="text-left px-4 py-3">Week Starting</th>
                      <th className="text-right px-4 py-3">Mentions</th>
                      <th className="text-right px-4 py-3">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.dataPoints.map((dp, i) => (
                      <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="px-4 py-2 text-gray-300">{dp.weekStart}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{dp.mentions}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-medium ${
                            dp.winRate > 0.5 ? "text-green-400" :
                            dp.winRate > 0 ? "text-yellow-400" :
                            "text-gray-500"
                          }`}>
                            {pct(dp.winRate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </VendorGuard>
    </div>
  );
}
