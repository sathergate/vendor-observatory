import { getVendorStats, getCategories } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

export default function VendorsPage() {
  const vendors = getVendorStats();
  const categories = getCategories();

  return (
    <div>
      <Breadcrumb items={[{ label: "Vendors" }]} />
      <h1 className="text-2xl font-bold mb-6">Vendor Frequency</h1>

      {vendors.length > 0 ? (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-4 py-3 text-gray-400">Vendor</th>
                  <th className="text-left px-4 py-3 text-gray-400">Category</th>
                  <th className="text-right px-4 py-3 text-gray-400">Total</th>
                  <th className="text-right px-4 py-3 text-green-400">Installed</th>
                  <th className="text-right px-4 py-3 text-yellow-400">Configured</th>
                  <th className="text-right px-4 py-3 text-blue-400">Recommended</th>
                  <th className="text-right px-4 py-3 text-gray-400">Mentioned</th>
                  <th className="text-right px-4 py-3 text-red-400">Rejected</th>
                  <th className="text-left px-4 py-3 text-gray-400">Platforms</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.vendor_canonical_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-2 font-medium">{vendorDisplayName(v.vendor_canonical_id)}</td>
                    <td className="px-4 py-2 text-gray-400">{v.work_category ?? "\u2014"}</td>
                    <td className="px-4 py-2 text-right font-bold">{v.total}</td>
                    <td className="px-4 py-2 text-right text-green-400">{v.installed || "\u2014"}</td>
                    <td className="px-4 py-2 text-right text-yellow-400">{v.configured || "\u2014"}</td>
                    <td className="px-4 py-2 text-right text-blue-400">{v.recommended || "\u2014"}</td>
                    <td className="px-4 py-2 text-right">{v.mentioned || "\u2014"}</td>
                    <td className="px-4 py-2 text-right text-red-400">{v.rejected || "\u2014"}</td>
                    <td className="px-4 py-2 text-gray-400">{v.platforms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <p>No vendor data yet. Run <code className="bg-gray-800 px-2 py-1 rounded">obs ingest --source all</code></p>
        </div>
      )}
    </div>
  );
}
