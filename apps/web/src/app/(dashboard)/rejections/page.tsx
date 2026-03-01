import {
  getRejectionSummary,
  getRejectionReasonBreakdown,
  getAlternativeFlows,
  getRejectionDetails,
} from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  too_expensive: { label: "Too Expensive", color: "text-data-3" },
  too_complex: { label: "Too Complex", color: "text-data-3" },
  poor_docs: { label: "Poor Docs", color: "text-data-1" },
  not_available_region: { label: "Region Unavailable", color: "text-data-2" },
  feature_gap: { label: "Feature Gap", color: "text-data-4" },
  trust_concerns: { label: "Trust Concerns", color: "text-data-4" },
  vendor_lock_in: { label: "Vendor Lock-in", color: "text-data-2" },
};

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason]?.label ?? reason.replace(/_/g, " ");
}

function reasonColor(reason: string): string {
  return REASON_LABELS[reason]?.color ?? "text-secondary";
}

export default async function RejectionsPage() {
  const [summary, reasonBreakdown, alternativeFlows, recentDetails] = await Promise.all([
    getRejectionSummary(),
    getRejectionReasonBreakdown(),
    getAlternativeFlows(),
    getRejectionDetails(undefined, 50),
  ]);

  const totalRejections = summary.reduce((acc, v) => acc + v.total_rejections, 0);
  const vendorsRejected = summary.length;
  const avgRejectionRate = summary.length > 0
    ? summary.reduce((acc, v) => acc + v.rejection_rate, 0) / summary.length
    : 0;
  const withAlternative = summary.filter(v => v.top_alternative).length;

  const hasData = summary.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Rejections" }]} />
        <h2 className="section-header">Vendor Rejections</h2>
        <p className="text-secondary text-[13px] mt-1">
          Why vendors get rejected and who is selected instead. Understanding loss reasons is more valuable than knowing you were mentioned.
        </p>
      </div>

      {!hasData && (
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">No organic signal detected in this period.</p>
          <p className="text-muted text-[13px] italic mt-2">
            Run <code className="bg-raised px-2 py-0.5 rounded-[6px] text-[12px] font-mono text-accent">obs ingest --source all</code> or benchmarks to generate rejection analysis.
          </p>
        </div>
      )}

      {/* Summary Stats */}
      {hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface rounded-[6px] p-6 border border-border">
            <p className="stat-label">Total Rejections</p>
            <p className="stat-hero mt-1 text-data-4">{totalRejections.toLocaleString()}</p>
          </div>
          <div className="bg-surface rounded-[6px] p-6 border border-border">
            <p className="stat-label">Vendors Rejected</p>
            <p className="stat-hero mt-1">{vendorsRejected.toLocaleString()}</p>
          </div>
          <div className="bg-surface rounded-[6px] p-6 border border-border">
            <p className="stat-label">Avg Rejection Rate</p>
            <p className="stat-hero mt-1 text-data-3">
              {(avgRejectionRate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="bg-surface rounded-[6px] p-6 border border-border">
            <p className="stat-label">With Alternative</p>
            <p className="stat-hero mt-1 text-data-5">{withAlternative.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Section 1: Rejection Reason Breakdown */}
      {reasonBreakdown.length > 0 && (
        <section className="space-y-4">
          <h3 className="section-header">Rejection Reasons (All Vendors)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {reasonBreakdown.map((r) => (
              <div key={r.reason} className="bg-surface rounded-[6px] p-6 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-medium text-[13px] ${reasonColor(r.reason)}`}>
                    {reasonLabel(r.reason)}
                  </span>
                  <span className="font-data text-[13px] text-secondary">{r.count.toLocaleString()}</span>
                </div>
                <div className="bg-raised rounded-[6px] h-2">
                  <div
                    className="bg-data-4 h-full rounded-[6px] transition-all"
                    style={{ width: `${Math.min(100, r.percentage * 100)}%` }}
                  />
                </div>
                <p className="stat-context mt-1">
                  {(r.percentage * 100).toFixed(1)}% of all rejections
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 2: Vendor Rejection Summary Table */}
      {summary.length > 0 && (
        <section className="space-y-4">
          <h3 className="section-header">Vendor Rejection Summary</h3>
          <p className="text-[13px] text-secondary">
            Vendors ranked by rejection count. Higher rejection rate = more frequently advised against.
          </p>
          <div className="bg-surface rounded-[6px] border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="th-label text-left px-4 h-12">Vendor</th>
                    <th className="th-label text-right px-4 h-12">Rejections</th>
                    <th className="th-label text-right px-4 h-12">Mentions</th>
                    <th className="th-label text-right px-4 h-12">Rej. Rate</th>
                    <th className="th-label text-right px-4 h-12">Price</th>
                    <th className="th-label text-right px-4 h-12">Complex</th>
                    <th className="th-label text-right px-4 h-12">Feature</th>
                    <th className="th-label text-right px-4 h-12">Lock-in</th>
                    <th className="th-label text-left px-4 h-12">Top Alternative</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((v) => (
                    <tr key={v.vendor_canonical_id} className="border-b border-border-subtle hover:bg-raised h-12">
                      <td className="px-4 py-2 text-primary font-medium">{vendorDisplayName(v.vendor_canonical_id)}</td>
                      <td className="px-4 py-2 text-right text-data-4"><span className="font-data">{v.total_rejections.toLocaleString()}</span></td>
                      <td className="px-4 py-2 text-right text-secondary"><span className="font-data">{v.total_mentions.toLocaleString()}</span></td>
                      <td className="px-4 py-2 text-right text-data-3">
                        <span className="font-data">{(v.rejection_rate * 100).toFixed(1)}%</span>
                      </td>
                      <td className="px-4 py-2 text-right text-data-3"><span className="font-data">{v.too_expensive ? v.too_expensive.toLocaleString() : "\u2014"}</span></td>
                      <td className="px-4 py-2 text-right text-data-3"><span className="font-data">{v.too_complex ? v.too_complex.toLocaleString() : "\u2014"}</span></td>
                      <td className="px-4 py-2 text-right text-data-4"><span className="font-data">{v.feature_gap ? v.feature_gap.toLocaleString() : "\u2014"}</span></td>
                      <td className="px-4 py-2 text-right text-data-2"><span className="font-data">{v.vendor_lock_in ? v.vendor_lock_in.toLocaleString() : "\u2014"}</span></td>
                      <td className="px-4 py-2 text-data-5">
                        {v.top_alternative ? vendorDisplayName(v.top_alternative) : "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Section 3: Alternative Flows */}
      {alternativeFlows.length > 0 && (
        <section className="space-y-4">
          <h3 className="section-header">Rejection to Alternative Flows</h3>
          <p className="text-[13px] text-secondary">
            When a vendor is rejected, which vendor is selected instead?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {alternativeFlows.slice(0, 12).map((flow) => (
              <div key={`${flow.rejected_vendor}-${flow.chosen_alternative}`} className="bg-surface rounded-[6px] p-6 border border-border">
                <div className="flex items-center gap-2">
                  <span className="text-data-4 line-through text-[13px]">
                    {vendorDisplayName(flow.rejected_vendor)}
                  </span>
                  <span className="text-muted">{"\u2192"}</span>
                  <span className="text-data-5 font-medium text-[13px]">
                    {vendorDisplayName(flow.chosen_alternative)}
                  </span>
                </div>
                <p className="stat-context mt-2">
                  <span className="font-data">{flow.count.toLocaleString()}</span> time{flow.count !== 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 4: Recent Rejection Details */}
      {recentDetails.length > 0 && (
        <section className="space-y-4">
          <h3 className="section-header">Recent Rejections</h3>
          <div className="space-y-2">
            {recentDetails.slice(0, 20).map((d) => (
              <div key={d.id} className="bg-surface rounded-[6px] p-6 border border-border">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-medium text-data-4 text-[13px]">
                    {vendorDisplayName(d.vendor_canonical_id)}
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-[6px] ${reasonColor(d.rejection_reason)} bg-raised`}>
                    {reasonLabel(d.rejection_reason)}
                  </span>
                  {d.chosen_alternative && (
                    <span className="text-[12px] text-data-5">
                      {"\u2192"} {vendorDisplayName(d.chosen_alternative)}
                    </span>
                  )}
                  {d.source_platform && (
                    <span className="text-[12px] text-muted ml-auto">{d.source_platform}</span>
                  )}
                </div>
                {d.rejection_reason_detail && (
                  <p className="text-[13px] text-secondary line-clamp-2">{d.rejection_reason_detail}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
