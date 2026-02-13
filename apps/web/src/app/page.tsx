import { getDashboardStats, getTopVendors } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const stats = getDashboardStats();
  const topVendors = getTopVendors(15);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Sessions Scanned" value={stats.totalSessions} />
        <StatCard label="Vendor Observations" value={stats.totalObservations} />
        <StatCard label="Unique Vendors" value={stats.uniqueVendors} />
        <StatCard
          label="Last Ingested"
          value={stats.lastIngestedAt ? new Date(stats.lastIngestedAt).toLocaleDateString() : "Never"}
          isText
        />
      </div>

      {/* Platform Breakdown */}
      {Object.keys(stats.platformBreakdown).length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Platform Breakdown</h2>
          <div className="flex gap-4">
            {Object.entries(stats.platformBreakdown).map(([platform, count]) => (
              <div key={platform} className="bg-gray-800 rounded-lg px-4 py-3">
                <div className="text-sm text-gray-400">{platform.replace("_", " ")}</div>
                <div className="text-xl font-bold text-blue-400">{count} sessions</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Vendors */}
      {topVendors.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Top Vendors by Frequency</h2>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-4 py-2 text-gray-400">#</th>
                  <th className="text-left px-4 py-2 text-gray-400">Vendor</th>
                  <th className="text-right px-4 py-2 text-gray-400">Observations</th>
                  <th className="text-left px-4 py-2 text-gray-400">Bar</th>
                </tr>
              </thead>
              <tbody>
                {topVendors.map((v, i) => {
                  const maxCount = topVendors[0]?.count ?? 1;
                  const pct = Math.round((v.count / maxCount) * 100);
                  return (
                    <tr key={v.vendor_canonical_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">{v.vendor_canonical_id}</td>
                      <td className="px-4 py-2 text-right text-blue-400">{v.count}</td>
                      <td className="px-4 py-2">
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats.totalSessions === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No data yet</p>
          <p className="text-sm">Run <code className="bg-gray-800 px-2 py-1 rounded">obs ingest --source all</code> to scan your transcripts</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, isText }: { label: string; value: number | string; isText?: boolean }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${isText ? "text-gray-300 text-base" : "text-blue-400"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
