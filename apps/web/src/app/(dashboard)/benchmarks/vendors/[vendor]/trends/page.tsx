import { getVendorTrend } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { TabbedView, TabPanel } from "@/components/TabbedView";
import { VendorGuard } from "@/components/VendorGuard";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
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
        <h1 className="text-2xl font-bold text-primary">Confidence Trends</h1>

        {!trend || trend.dataPoints.length === 0 ? (
          <div className="quiet-signal">
            <p className="text-secondary">No trend data available yet.</p>
          </div>
        ) : (
          <>
            <TabbedView sections={[
              { id: "trend-kpis", label: "KPIs" },
              { id: "activity", label: "Activity" },
              { id: "weekly-data", label: "Weekly Data" },
            ]}>

            {/* Trend KPIs */}
            <TabPanel id="trend-kpis"><div>
              <h2 className="section-header mb-3">Trend Overview</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-surface rounded-[6px] p-4 border border-border">
                  <p className="stat-label">Win Rate Trend</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-[32px] font-bold">
                      {trend.trend === "rising" ? "\u2191" : trend.trend === "falling" ? "\u2193" : "\u2192"}
                    </span>
                    <span className={`text-[20px] font-bold font-data ${
                      trend.trend === "rising" ? "text-signal-strong" :
                      trend.trend === "falling" ? "text-data-4" :
                      "text-secondary"
                    }`}>
                      {trend.winRateDelta >= 0 ? "+" : ""}{pct(trend.winRateDelta)}
                    </span>
                  </div>
                  <p className="stat-context mt-1">
                    {pct(trend.previousWinRate)} → {pct(trend.currentWinRate)}
                  </p>
                </div>
                <div className="bg-surface rounded-[6px] p-4 border border-border">
                  <p className="stat-label">Current Win Rate</p>
                  <p className={`stat-hero mt-1 ${
                    trend.currentWinRate > 0.6 ? "!text-signal-strong" :
                    trend.currentWinRate > 0.3 ? "!text-data-3" : "!text-data-4"
                  }`}>
                    {pct(trend.currentWinRate)}
                  </p>
                  <p className="stat-context mt-1">vs prior: {pct(trend.previousWinRate)}</p>
                </div>
                <div className="bg-surface rounded-[6px] p-4 border border-border">
                  <p className="stat-label">Mention Volume</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className={`stat-hero ${
                      trend.mentionDelta > 0 ? "!text-signal-strong" :
                      trend.mentionDelta < 0 ? "!text-data-4" :
                      "!text-secondary"
                    }`}>
                      {trend.currentMentions.toLocaleString()}
                    </span>
                    <span className="text-[13px] text-muted">
                      ({trend.mentionDelta >= 0 ? "+" : ""}{trend.mentionDelta.toLocaleString()} vs prior)
                    </span>
                  </div>
                </div>
              </div>
            </div></TabPanel>

            {/* Sparkline */}
            <TabPanel id="activity"><div>
              <h2 className="section-header mb-3">Weekly Activity</h2>
              <div className="bg-surface rounded-[6px] p-4 border border-border">
                <div className="flex items-end gap-1 h-24">
                  {trend.dataPoints.map((dp, i) => {
                    const maxMentions = Math.max(...trend.dataPoints.map(p => p.mentions), 1);
                    const height = Math.max(4, (dp.mentions / maxMentions) * 96);
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${
                          dp.winRate > 0.5 ? "bg-signal-strong/70" :
                          dp.winRate > 0 ? "bg-data-3/70" :
                          "bg-data-muted"
                        }`}
                        style={{ height: `${height}px` }}
                        title={`${dp.weekStart}: ${dp.mentions} mentions, ${pct(dp.winRate)} win rate`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[12px] text-muted mt-2">
                  <span>{trend.dataPoints[0]?.weekStart}</span>
                  <span>{trend.dataPoints[trend.dataPoints.length - 1]?.weekStart}</span>
                </div>
                <div className="flex gap-3 mt-3 text-[12px] text-muted">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-signal-strong/70" /> Win rate &gt; 50%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-data-3/70" /> Win rate &gt; 0%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-data-muted" /> No wins
                  </span>
                </div>
              </div>
            </div></TabPanel>

            {/* Raw Data Table */}
            <TabPanel id="weekly-data"><div>
              <h2 className="section-header mb-3">Weekly Breakdown</h2>
              <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="th-label text-left px-4 py-3">Week Starting</th>
                      <th className="th-label text-right px-4 py-3">Mentions</th>
                      <th className="th-label text-right px-4 py-3">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.dataPoints.map((dp, i) => (
                      <tr key={i} className="border-b border-border-subtle hover:bg-raised h-12">
                        <td className="px-4 text-primary">{dp.weekStart}</td>
                        <td className="px-4 text-right text-primary font-data">{dp.mentions.toLocaleString()}</td>
                        <td className="px-4 text-right">
                          <span className={`font-data font-medium ${
                            dp.winRate > 0.5 ? "text-signal-strong" :
                            dp.winRate > 0 ? "text-data-3" :
                            "text-muted"
                          }`}>
                            {pct(dp.winRate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div></TabPanel>
          </TabbedView>
          </>
        )}
      </VendorGuard>
    </div>
  );
}
