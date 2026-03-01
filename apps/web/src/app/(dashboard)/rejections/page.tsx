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
  too_expensive: { label: "Too Expensive", color: "text-yellow-400" },
  too_complex: { label: "Too Complex", color: "text-orange-400" },
  poor_docs: { label: "Poor Docs", color: "text-purple-400" },
  not_available_region: { label: "Region Unavailable", color: "text-blue-400" },
  feature_gap: { label: "Feature Gap", color: "text-red-400" },
  trust_concerns: { label: "Trust Concerns", color: "text-pink-400" },
  vendor_lock_in: { label: "Vendor Lock-in", color: "text-cyan-400" },
};

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason]?.label ?? reason.replace(/_/g, " ");
}

function reasonColor(reason: string): string {
  return REASON_LABELS[reason]?.color ?? "text-gray-400";
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
        <h1 className="text-2xl font-bold">Vendor Rejections</h1>
        <p className="text-gray-400 mt-1">
          Why vendors get rejected and who wins instead. Understanding loss reasons is more valuable than knowing you were mentioned.
        </p>
      </div>

      {!hasData && (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">
            No rejection data available yet. Run{" "}
            <code className="text-blue-400 bg-gray-700 px-2 py-0.5 rounded">obs ingest --source all</code>{" "}
            or benchmarks to generate rejection analysis.
          </p>
        </div>
      )}

      {/* Summary Stats */}
      {hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Total Rejections</p>
            <p className="text-2xl font-bold mt-1 text-red-400">{totalRejections}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Vendors Rejected</p>
            <p className="text-2xl font-bold mt-1">{vendorsRejected}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Avg Rejection Rate</p>
            <p className="text-2xl font-bold mt-1 text-yellow-400">
              {(avgRejectionRate * 100).toFixed(0)}%
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">With Alternative</p>
            <p className="text-2xl font-bold mt-1 text-green-400">{withAlternative}</p>
          </div>
        </div>
      )}

      {/* Section 1: Rejection Reason Breakdown */}
      {reasonBreakdown.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Rejection Reasons (All Vendors)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {reasonBreakdown.map((r) => (
              <div key={r.reason} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-medium ${reasonColor(r.reason)}`}>
                    {reasonLabel(r.reason)}
                  </span>
                  <span className="text-sm text-gray-400">{r.count}</span>
                </div>
                <div className="bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-red-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, r.percentage * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {(r.percentage * 100).toFixed(0)}% of all rejections
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 2: Vendor Rejection Summary Table */}
      {summary.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Vendor Rejection Summary</h2>
          <p className="text-sm text-gray-400">
            Vendors ranked by rejection count. Higher rejection rate = more frequently advised against.
          </p>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left px-4 py-3 text-gray-400">Vendor</th>
                    <th className="text-right px-4 py-3 text-red-400">Rejections</th>
                    <th className="text-right px-4 py-3 text-gray-400">Mentions</th>
                    <th className="text-right px-4 py-3 text-yellow-400">Rej. Rate</th>
                    <th className="text-right px-4 py-3 text-yellow-400">Price</th>
                    <th className="text-right px-4 py-3 text-orange-400">Complex</th>
                    <th className="text-right px-4 py-3 text-red-400">Feature</th>
                    <th className="text-right px-4 py-3 text-cyan-400">Lock-in</th>
                    <th className="text-left px-4 py-3 text-green-400">Top Alternative</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((v) => (
                    <tr key={v.vendor_canonical_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="px-4 py-2 font-medium">{vendorDisplayName(v.vendor_canonical_id)}</td>
                      <td className="px-4 py-2 text-right text-red-400 font-bold">{v.total_rejections}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{v.total_mentions}</td>
                      <td className="px-4 py-2 text-right text-yellow-400">
                        {(v.rejection_rate * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-2 text-right text-yellow-400">{v.too_expensive || "\u2014"}</td>
                      <td className="px-4 py-2 text-right text-orange-400">{v.too_complex || "\u2014"}</td>
                      <td className="px-4 py-2 text-right text-red-400">{v.feature_gap || "\u2014"}</td>
                      <td className="px-4 py-2 text-right text-cyan-400">{v.vendor_lock_in || "\u2014"}</td>
                      <td className="px-4 py-2 text-green-400">
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
          <h2 className="text-lg font-semibold">Rejection → Alternative Flows</h2>
          <p className="text-sm text-gray-400">
            When a vendor is rejected, which vendor wins instead?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {alternativeFlows.slice(0, 12).map((flow) => (
              <div key={`${flow.rejected_vendor}-${flow.chosen_alternative}`} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <span className="text-red-400 line-through text-sm">
                    {vendorDisplayName(flow.rejected_vendor)}
                  </span>
                  <span className="text-gray-500">→</span>
                  <span className="text-green-400 font-medium text-sm">
                    {vendorDisplayName(flow.chosen_alternative)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">{flow.count} time{flow.count !== 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 4: Recent Rejection Details */}
      {recentDetails.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Recent Rejections</h2>
          <div className="space-y-2">
            {recentDetails.slice(0, 20).map((d) => (
              <div key={d.id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-medium text-red-400">
                    {vendorDisplayName(d.vendor_canonical_id)}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${reasonColor(d.rejection_reason)} bg-gray-700`}>
                    {reasonLabel(d.rejection_reason)}
                  </span>
                  {d.chosen_alternative && (
                    <span className="text-xs text-green-400">
                      → {vendorDisplayName(d.chosen_alternative)}
                    </span>
                  )}
                  {d.source_platform && (
                    <span className="text-xs text-gray-500 ml-auto">{d.source_platform}</span>
                  )}
                </div>
                {d.rejection_reason_detail && (
                  <p className="text-sm text-gray-400 line-clamp-2">{d.rejection_reason_detail}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
