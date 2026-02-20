import { getPlatformComparison } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

export default async function PlatformsPage() {
  const data = await getPlatformComparison();

  return (
    <div>
      <Breadcrumb items={[{ label: "Platforms" }]} />
      <h1 className="text-2xl font-bold mb-6">Platform Comparison</h1>
      <p className="text-gray-400 mb-4">Side-by-side: what does Claude Code recommend vs Codex CLI?</p>

      {data.length > 0 ? (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-gray-400">Vendor</th>
                <th className="text-right px-4 py-3 text-blue-400">Claude Code</th>
                <th className="text-right px-4 py-3 text-green-400">Codex CLI</th>
                <th className="text-right px-4 py-3 text-gray-400">Delta</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const delta = row.claude_code_count - row.codex_cli_count;
                const unique = row.claude_code_count === 0 || row.codex_cli_count === 0;
                return (
                  <tr key={row.vendor_canonical_id} className={`border-b border-gray-700/50 hover:bg-gray-700/30 ${unique ? "bg-gray-800/50" : ""}`}>
                    <td className="px-4 py-2 font-medium">
                      {vendorDisplayName(row.vendor_canonical_id)}
                      {unique && <span className="ml-2 text-xs text-yellow-500">unique</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-blue-400">{row.claude_code_count || "\u2014"}</td>
                    <td className="px-4 py-2 text-right text-green-400">{row.codex_cli_count || "\u2014"}</td>
                    <td className={`px-4 py-2 text-right ${delta > 0 ? "text-blue-400" : delta < 0 ? "text-green-400" : "text-gray-500"}`}>
                      {delta > 0 ? `+${delta}` : delta === 0 ? "\u2014" : String(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <p>No platform comparison data yet.</p>
        </div>
      )}
    </div>
  );
}
