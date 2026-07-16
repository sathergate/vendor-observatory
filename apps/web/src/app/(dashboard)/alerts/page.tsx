import Link from "next/link";
import { Breadcrumb } from "@/components/Breadcrumb";
import { StatCard } from "@/components/StatCard";
import { getLatestDigests, getTemporalDrift } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";

export const dynamic = "force-dynamic";

const SEVERITY_STYLES: Record<string, { dot: string; bg: string; text: string }> = {
  high: { dot: "bg-data-4", bg: "bg-data-4/5", text: "text-data-4" },
  medium: { dot: "bg-data-3", bg: "bg-data-3/5", text: "text-data-3" },
  low: { dot: "bg-data-muted", bg: "", text: "text-muted" },
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  drift_up: "Detection rate increase",
  drift_down: "Detection rate decrease",
  new_vendor: "New vendor detected",
  rejection_spike: "Rejection spike",
  coverage_drop: "Coverage drop",
  competitor_gain: "Competitor gaining",
};

export default async function AlertsPage() {
  const [digests, drift] = await Promise.all([
    getLatestDigests(10),
    getTemporalDrift(),
  ]);

  // Flatten all alerts with dates
  const allAlerts = digests.flatMap((d) =>
    d.alerts.map((a) => ({ ...a, run_date: d.run_date, summary: d.summary })),
  );

  const highAlerts = allAlerts.filter((a) => a.severity === "high").length;
  const mediumAlerts = allAlerts.filter((a) => a.severity === "medium").length;
  const totalDigests = digests.length;

  const hasData = digests.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Breadcrumb items={[{ label: "Alerts" }]} />
        <h2 className="section-header">Daily Digest &amp; Alerts</h2>
        <p className="text-secondary text-[13px] mt-1">
          Automated daily analysis of vendor detection changes, rejection spikes, and competitive shifts.
        </p>
      </div>

      {!hasData && (
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">No digest data yet.</p>
          <p className="text-muted text-[13px] italic mt-2">
            Daily digests are generated automatically after benchmark runs complete.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="DIGESTS AVAILABLE"
              value={totalDigests.toLocaleString()}
              subtext="daily analysis reports"
            />
            <StatCard
              label="HIGH SEVERITY"
              value={highAlerts.toLocaleString()}
              subtext="alerts requiring attention"
              valueClassName={highAlerts > 0 ? "text-data-4" : ""}
            />
            <StatCard
              label="MEDIUM SEVERITY"
              value={mediumAlerts.toLocaleString()}
              subtext="notable changes"
              valueClassName={mediumAlerts > 0 ? "text-data-3" : ""}
            />
            <StatCard
              label="VENDORS DRIFTING"
              value={drift.length.toLocaleString()}
              subtext=">15% detection rate change"
            />
          </div>

          {/* Alert Feed */}
          <section className="space-y-4">
            <h3 className="section-header">Alert Feed</h3>
            {allAlerts.length > 0 ? (
              <div className="space-y-2">
                {allAlerts.map((alert, i) => {
                  const severity = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.low;
                  return (
                    <div key={i} className={`bg-surface rounded-[6px] p-4 border border-border ${severity.bg}`}>
                      <div className="flex items-start gap-3">
                        <span className={`shrink-0 w-2.5 h-2.5 rounded-full mt-1 ${severity.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[13px] text-primary">{alert.message}</p>
                            <span className={`text-[11px] px-1.5 py-0.5 rounded-[6px] bg-raised ${severity.text}`}>
                              {alert.severity}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            {alert.vendor && (
                              <Link
                                href={`/benchmarks/vendors/${encodeURIComponent(alert.vendor)}`}
                                className="text-[12px] text-accent hover:text-accent/80"
                              >
                                {vendorDisplayName(alert.vendor)}
                              </Link>
                            )}
                            {alert.alertType && (
                              <span className="text-[11px] text-muted">
                                {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
                              </span>
                            )}
                            <span className="text-[11px] text-muted ml-auto">{alert.run_date}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="quiet-signal">
                <p className="text-secondary text-[14px]">No alerts in recent digests.</p>
              </div>
            )}
          </section>

          {/* Digest History */}
          <section className="space-y-4">
            <h3 className="section-header">Digest History</h3>
            <div className="space-y-3">
              {digests.map((d, i) => (
                <div key={i} className="bg-surface rounded-[6px] p-5 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-medium text-primary font-data">{d.run_date}</span>
                    <span className="text-[12px] text-muted">
                      {d.alerts.length} alert{d.alerts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {d.summary && (
                    <p className="text-[13px] text-secondary mb-3">{d.summary}</p>
                  )}
                  {d.alerts.length > 0 && (
                    <div className="space-y-1.5">
                      {d.alerts.map((a, j) => {
                        const sev = SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.low;
                        return (
                          <div key={j} className="flex items-center gap-2 text-[12px]">
                            <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                            <span className="text-secondary">{a.message}</span>
                            {a.vendor && (
                              <Link
                                href={`/benchmarks/vendors/${encodeURIComponent(a.vendor)}`}
                                className="text-accent hover:text-accent/80"
                              >
                                {vendorDisplayName(a.vendor)}
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Temporal Drift Summary */}
          {drift.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="section-header">Active Drift Signals</h3>
                <Link href="/insights" className="text-[12px] text-accent hover:text-accent/80">Full analysis</Link>
              </div>
              <div className="bg-surface rounded-[6px] border border-border overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="th-label text-left px-4 h-12">Vendor</th>
                      <th className="th-label text-right px-4 h-12">Early Rate</th>
                      <th className="th-label text-right px-4 h-12">Late Rate</th>
                      <th className="th-label text-right px-4 h-12">Delta</th>
                      <th className="th-label text-center px-4 h-12">Direction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drift.map((d) => (
                      <tr key={d.vendor} className="border-b border-border-subtle hover:bg-raised h-12">
                        <td className="px-4 py-2">
                          <Link
                            href={`/benchmarks/vendors/${encodeURIComponent(d.vendor)}`}
                            className="text-primary hover:text-accent"
                          >
                            {vendorDisplayName(d.vendor)}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right font-data text-muted">
                          {(d.earlyWinRate * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-2 text-right font-data text-secondary">
                          {(d.lateWinRate * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-data font-medium ${d.delta > 0 ? "text-data-5" : "text-data-4"}`}>
                            {d.delta > 0 ? "+" : ""}{(d.delta * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center text-[16px]">
                          {d.delta > 0 ? "\u2197" : "\u2198"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Annotation */}
          <div className="border-l-2 border-data-muted pl-3 max-w-[480px]">
            <p className="text-[13px] text-muted italic">
              Digests are generated daily after benchmark runs complete. Alerts are triggered
              when vendor detection rates change by more than 15%, rejection rates spike,
              or new vendors appear in benchmark responses.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
