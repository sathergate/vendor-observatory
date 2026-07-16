import { getActionFunnel } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

export default async function ActionsPage() {
  const funnel = await getActionFunnel();

  return (
    <div>
      <Breadcrumb items={[{ label: "Actions" }]} />
      <h2 className="section-header mb-2">Detection Funnel</h2>
      <p className="text-secondary text-[13px] mb-6">Which vendors get mentioned AND then actually installed?</p>

      {funnel.length > 0 ? (
        <div className="bg-surface rounded-[6px] border border-border overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="th-label text-left px-4 h-12">Vendor</th>
                <th className="th-label text-right px-4 h-12">Mentioned</th>
                <th className="th-label text-right px-4 h-12">Detected</th>
                <th className="th-label text-right px-4 h-12">Installed / Configured</th>
                <th className="th-label text-right px-4 h-12">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {funnel.map((row) => {
                const rate = row.recommended_total > 0
                  ? (row.installed_total / row.recommended_total) * 100
                  : 0;
                return (
                  <tr key={row.vendor_canonical_id} className="border-b border-border-subtle hover:bg-raised h-12">
                    <td className="px-4 py-2 text-primary font-medium">{vendorDisplayName(row.vendor_canonical_id)}</td>
                    <td className="px-4 py-2 text-right text-secondary"><span className="font-data">{Number(row.mentioned_total).toLocaleString()}</span></td>
                    <td className="px-4 py-2 text-right text-data-1"><span className="font-data">{row.recommended_total ? Number(row.recommended_total).toLocaleString() : "\u2014"}</span></td>
                    <td className="px-4 py-2 text-right text-data-2"><span className="font-data">{row.installed_total ? Number(row.installed_total).toLocaleString() : "\u2014"}</span></td>
                    <td className="px-4 py-2 text-right">
                      {row.recommended_total > 0 ? (
                        <span className={`font-data ${rate >= 50 ? "text-signal-strong" : rate > 0 ? "text-data-3" : "text-muted"}`}>
                          {rate.toFixed(1)}%
                        </span>
                      ) : <span className="text-muted">{"\u2014"}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">No organic signal detected in this period.</p>
          <p className="text-muted text-[13px] italic mt-2">Ingest transcripts to populate the detection funnel.</p>
        </div>
      )}
    </div>
  );
}
