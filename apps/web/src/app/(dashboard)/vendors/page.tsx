import { getVendorStats, getCategories } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const vendors = await getVendorStats();
  const categories = await getCategories();

  return (
    <div>
      <Breadcrumb items={[{ label: "Vendors" }]} />
      <h2 className="section-header mb-6">Vendor Frequency</h2>

      {vendors.length > 0 ? (
        <div className="bg-surface rounded-[6px] border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="th-label text-left px-4 h-12">Vendor</th>
                  <th className="th-label text-left px-4 h-12">Category</th>
                  <th className="th-label text-right px-4 h-12">Total</th>
                  <th className="th-label text-right px-4 h-12">Installed</th>
                  <th className="th-label text-right px-4 h-12">Configured</th>
                  <th className="th-label text-right px-4 h-12">Detected</th>
                  <th className="th-label text-right px-4 h-12">Mentioned</th>
                  <th className="th-label text-right px-4 h-12">Rejected</th>
                  <th className="th-label text-left px-4 h-12">Platforms</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.vendor_canonical_id} className="border-b border-border-subtle hover:bg-raised h-12">
                    <td className="px-4 py-2 text-primary font-medium">{vendorDisplayName(v.vendor_canonical_id)}</td>
                    <td className="px-4 py-2 text-secondary">{v.work_category ?? "\u2014"}</td>
                    <td className="px-4 py-2 text-right text-primary"><span className="font-data">{Number(v.total).toLocaleString()}</span></td>
                    <td className="px-4 py-2 text-right text-data-1"><span className="font-data">{v.installed ? Number(v.installed).toLocaleString() : "\u2014"}</span></td>
                    <td className="px-4 py-2 text-right text-data-3"><span className="font-data">{v.configured ? Number(v.configured).toLocaleString() : "\u2014"}</span></td>
                    <td className="px-4 py-2 text-right text-data-2"><span className="font-data">{v.recommended ? Number(v.recommended).toLocaleString() : "\u2014"}</span></td>
                    <td className="px-4 py-2 text-right text-secondary"><span className="font-data">{v.mentioned ? Number(v.mentioned).toLocaleString() : "\u2014"}</span></td>
                    <td className="px-4 py-2 text-right text-data-4"><span className="font-data">{v.rejected ? Number(v.rejected).toLocaleString() : "\u2014"}</span></td>
                    <td className="px-4 py-2 text-secondary text-[12px]">{v.platforms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">No organic signal detected in this period.</p>
          <p className="text-muted text-[13px] italic mt-2">Run <code className="bg-raised px-2 py-1 rounded-[6px] text-[12px] font-mono">obs ingest --source all</code> to scan transcripts.</p>
        </div>
      )}
    </div>
  );
}
