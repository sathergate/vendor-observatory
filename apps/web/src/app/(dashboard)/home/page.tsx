import Link from "next/link";
import { Breadcrumb } from "@/components/Breadcrumb";
import { StatCard } from "@/components/StatCard";
import {
  getBenchmarkStats,
  getLatestDigests,
  getRejectionSummary,
  getTemporalDrift,
  getVendorTrend,
  getAllVendorNames,
} from "@/lib/db";
import { loadVendorFactors, getVendorFactors } from "@/lib/load-vendor-factors";
import { generateImprovements } from "@/lib/factor-improvements";
import { vendorDisplayName, VENDOR_META } from "@/lib/vendor-taxonomy";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function HomePage() {
  const [stats, digests, rejections, drift, allVendors] = await Promise.all([
    getBenchmarkStats(),
    getLatestDigests(3),
    getRejectionSummary(),
    getTemporalDrift(),
    getAllVendorNames(),
  ]);

  const factorDataset = loadVendorFactors();

  // Top vendors by mention count
  const topVendors = allVendors.slice(0, 5);

  // Vendors with significant drift
  const risingVendors = drift.filter((d) => d.delta > 0).slice(0, 3);
  const fallingVendors = drift.filter((d) => d.delta < 0).slice(0, 3);

  // Top rejection reasons across all vendors
  const totalRejections = rejections.reduce((sum, r) => sum + Number(r.total_rejections), 0);
  const topRejected = rejections.slice(0, 5);

  // Most recent digest alerts
  const recentAlerts = digests.flatMap((d) => d.alerts.map((a) => ({ ...a, run_date: d.run_date }))).slice(0, 5);

  // Generate next actions from factor analysis
  const nextActions: Array<{ vendor: string; action: string; priority: string; factor: string }> = [];
  for (const vendor of factorDataset.vendors.slice(0, 20)) {
    const catSummary = factorDataset.byCategory[VENDOR_META[vendor.vendorId]?.category ?? ""] ?? null;
    const improvements = generateImprovements(vendor, factorDataset.factors, catSummary);
    const critical = improvements.filter((i) => i.priority === "critical");
    for (const imp of critical.slice(0, 1)) {
      nextActions.push({
        vendor: vendor.vendorId,
        action: imp.title,
        priority: imp.priority,
        factor: imp.factorLabel,
      });
    }
  }

  const hasData = stats.totalBenchmarkSessions > 0 || allVendors.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Breadcrumb items={[{ label: "Home" }]} />
        <h1 className="text-[24px] font-bold text-primary">Dashboard</h1>
        <p className="text-secondary text-[13px] mt-1">
          Overview of vendor AI-recommendation landscape. Updated daily from benchmark runs.
        </p>
      </div>

      {!hasData && (
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">No data yet.</p>
          <p className="text-muted text-[13px] italic mt-2">
            Run benchmarks or ingest transcripts to populate the dashboard.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="BENCHMARK SESSIONS"
              value={stats.totalBenchmarkSessions.toLocaleString()}
              subtext={`${stats.totalBenchmarkObservations.toLocaleString()} vendor detections`}
            />
            <StatCard
              label="VENDORS TRACKED"
              value={allVendors.length.toLocaleString()}
              subtext={`across ${Object.keys(factorDataset.byCategory).length} categories`}
            />
            <StatCard
              label="TOTAL REJECTIONS"
              value={totalRejections.toLocaleString()}
              subtext={`${topRejected.length} vendors with rejections`}
              valueClassName={totalRejections > 0 ? "text-data-4" : ""}
            />
            <StatCard
              label="DRIFTING VENDORS"
              value={drift.length.toLocaleString()}
              subtext="significant detection rate changes"
              valueClassName={drift.length > 0 ? "text-data-3" : ""}
            />
          </div>

          {/* Two-column layout: Alerts + Top Vendors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Alerts */}
            <section className="bg-surface rounded-[6px] p-6 border border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="section-header">Recent Alerts</h3>
                <Link href="/insights" className="text-[12px] text-accent hover:text-accent/80">View all</Link>
              </div>
              {recentAlerts.length > 0 ? (
                <div className="space-y-3">
                  {recentAlerts.map((alert, i) => (
                    <div key={i} className="flex items-start gap-3 text-[13px]">
                      <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${
                        alert.severity === "high" ? "bg-data-4" : alert.severity === "medium" ? "bg-data-3" : "bg-data-muted"
                      }`} />
                      <div className="min-w-0">
                        <p className="text-primary">{alert.message}</p>
                        <p className="text-[11px] text-muted mt-0.5">
                          {alert.vendor && (
                            <Link
                              href={`/benchmarks/vendors/${encodeURIComponent(alert.vendor)}`}
                              className="text-accent hover:text-accent/80"
                            >
                              {vendorDisplayName(alert.vendor)}
                            </Link>
                          )}
                          {alert.run_date && <span className="ml-2">{alert.run_date}</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted">No recent alerts.</p>
              )}
            </section>

            {/* Top Vendors by Mention */}
            <section className="bg-surface rounded-[6px] p-6 border border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="section-header">Top Vendors</h3>
                <Link href="/vendors" className="text-[12px] text-accent hover:text-accent/80">View all</Link>
              </div>
              {topVendors.length > 0 ? (
                <div className="space-y-3">
                  {topVendors.map((v, i) => {
                    const factor = getVendorFactors(v.vendor);
                    return (
                      <div key={v.vendor} className="flex items-center gap-3">
                        <span className="font-data text-[12px] text-muted w-5">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/benchmarks/vendors/${encodeURIComponent(v.vendor)}`}
                            className="text-[13px] text-primary hover:text-accent"
                          >
                            {vendorDisplayName(v.vendor)}
                          </Link>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px] text-muted">
                              Win rate: <span className="font-data text-secondary">{pct(v.winRate)}</span>
                            </span>
                            {factor && (
                              <span className="text-[11px] text-muted">
                                Factor: <span className="font-data text-secondary">{factor.compositeScore.toFixed(1)}/5</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-data text-[12px] text-accent">{v.totalRecommendations}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[13px] text-muted">No vendor data yet.</p>
              )}
            </section>
          </div>

          {/* Temporal Drift: Rising & Falling */}
          {(risingVendors.length > 0 || fallingVendors.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Rising */}
              {risingVendors.length > 0 && (
                <section className="bg-surface rounded-[6px] p-6 border border-border">
                  <h3 className="section-header mb-4">Rising</h3>
                  <div className="space-y-3">
                    {risingVendors.map((d) => (
                      <div key={d.vendor} className="flex items-center justify-between">
                        <Link
                          href={`/benchmarks/vendors/${encodeURIComponent(d.vendor)}`}
                          className="text-[13px] text-primary hover:text-accent"
                        >
                          {vendorDisplayName(d.vendor)}
                        </Link>
                        <div className="flex items-center gap-3">
                          <span className="font-data text-[12px] text-muted">{pct(d.earlyWinRate)}</span>
                          <span className="text-muted text-[10px]">{"\u2192"}</span>
                          <span className="font-data text-[12px] text-secondary">{pct(d.lateWinRate)}</span>
                          <span className="font-data text-[12px] text-data-5 font-medium">+{pct(d.delta)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Falling */}
              {fallingVendors.length > 0 && (
                <section className="bg-surface rounded-[6px] p-6 border border-border">
                  <h3 className="section-header mb-4">Falling</h3>
                  <div className="space-y-3">
                    {fallingVendors.map((d) => (
                      <div key={d.vendor} className="flex items-center justify-between">
                        <Link
                          href={`/benchmarks/vendors/${encodeURIComponent(d.vendor)}`}
                          className="text-[13px] text-primary hover:text-accent"
                        >
                          {vendorDisplayName(d.vendor)}
                        </Link>
                        <div className="flex items-center gap-3">
                          <span className="font-data text-[12px] text-muted">{pct(d.earlyWinRate)}</span>
                          <span className="text-muted text-[10px]">{"\u2192"}</span>
                          <span className="font-data text-[12px] text-secondary">{pct(d.lateWinRate)}</span>
                          <span className="font-data text-[12px] text-data-4 font-medium">{pct(d.delta)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Top Rejections */}
          {topRejected.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="section-header">Top Rejection Patterns</h3>
                <Link href="/reasons/rejections" className="text-[12px] text-accent hover:text-accent/80">View details</Link>
              </div>
              <div className="bg-surface rounded-[6px] border border-border overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="th-label text-left px-4 h-12">Vendor</th>
                      <th className="th-label text-right px-4 h-12">Rejections</th>
                      <th className="th-label text-right px-4 h-12">Rejection Rate</th>
                      <th className="th-label text-left px-4 h-12">Top Alternative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRejected.map((r) => (
                      <tr key={r.vendor_canonical_id} className="border-b border-border-subtle hover:bg-raised h-12">
                        <td className="px-4 py-2">
                          <Link
                            href={`/benchmarks/vendors/${encodeURIComponent(r.vendor_canonical_id)}`}
                            className="text-primary hover:text-accent"
                          >
                            {vendorDisplayName(r.vendor_canonical_id)}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right font-data text-data-4">
                          {Number(r.total_rejections).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-data ${
                            r.rejection_rate > 0.3 ? "text-data-4" : r.rejection_rate > 0.15 ? "text-data-3" : "text-secondary"
                          }`}>
                            {pct(r.rejection_rate)}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {r.top_alternative ? (
                            <Link
                              href={`/benchmarks/vendors/${encodeURIComponent(r.top_alternative)}`}
                              className="text-accent hover:text-accent/80 text-[12px]"
                            >
                              {vendorDisplayName(r.top_alternative)}
                            </Link>
                          ) : (
                            <span className="text-muted">{"\u2014"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Next Actions from Factor Analysis */}
          {nextActions.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="section-header">Critical Factor Gaps</h3>
                <Link href="/fixes/factors" className="text-[12px] text-accent hover:text-accent/80">Factor analysis</Link>
              </div>
              <div className="space-y-2">
                {nextActions.slice(0, 5).map((action, i) => (
                  <div key={i} className="bg-surface rounded-[6px] p-4 border border-border border-l-4 border-l-data-4">
                    <div className="flex items-start gap-3">
                      <span className="text-[12px] font-bold px-1.5 py-0.5 rounded-[6px] bg-data-4/30 text-data-4 shrink-0 mt-0.5 font-data">
                        CRITICAL
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] text-primary font-medium">{action.action}</p>
                        <p className="text-[12px] text-muted mt-0.5">
                          <Link
                            href={`/fixes/factors/${encodeURIComponent(action.vendor)}`}
                            className="text-accent hover:text-accent/80"
                          >
                            {vendorDisplayName(action.vendor)}
                          </Link>
                          <span className="ml-2">{action.factor}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Annotation */}
          <div className="border-l-2 border-data-muted pl-3 max-w-[480px]">
            <p className="text-[13px] text-muted italic">
              n = {stats.totalBenchmarkSessions.toLocaleString()} benchmark sessions.
              Drift analysis compares early vs. late halves of a 60-day window.
              Factor gaps are based on the 13-factor AI-recommendation model.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
