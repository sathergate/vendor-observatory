import { getActionFunnel } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function ActionsPage() {
  const funnel = getActionFunnel();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Chosen vs Mentioned</h1>
      <p className="text-gray-400 mb-6">Which vendors get recommended AND then actually installed?</p>

      {funnel.length > 0 ? (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-gray-400">Vendor</th>
                <th className="text-right px-4 py-3 text-gray-400">Mentioned</th>
                <th className="text-right px-4 py-3 text-blue-400">Recommended</th>
                <th className="text-right px-4 py-3 text-green-400">Installed/Configured</th>
                <th className="text-right px-4 py-3 text-yellow-400">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {funnel.map((row) => {
                const rate = row.recommended_total > 0
                  ? Math.round((row.installed_total / row.recommended_total) * 100)
                  : 0;
                return (
                  <tr key={row.vendor_canonical_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-2 font-medium">{row.vendor_canonical_id}</td>
                    <td className="px-4 py-2 text-right">{row.mentioned_total}</td>
                    <td className="px-4 py-2 text-right text-blue-400">{row.recommended_total || "\u2014"}</td>
                    <td className="px-4 py-2 text-right text-green-400">{row.installed_total || "\u2014"}</td>
                    <td className="px-4 py-2 text-right">
                      {row.recommended_total > 0 ? (
                        <span className={rate >= 50 ? "text-green-400" : rate > 0 ? "text-yellow-400" : "text-gray-500"}>
                          {rate}%
                        </span>
                      ) : "\u2014"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <p>No action data yet.</p>
        </div>
      )}
    </div>
  );
}
