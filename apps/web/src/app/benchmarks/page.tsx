import { getBenchmarkStats, getBenchmarkSessions, getBenchmarkVendorComparison } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function BenchmarksPage() {
  const stats = getBenchmarkStats();
  const sessions = getBenchmarkSessions(50);
  const vendorComp = getBenchmarkVendorComparison();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Benchmarks</h1>
        <p className="text-gray-400 mt-1">
          Automated daily benchmark runs across Claude Code, Codex CLI, and Cursor Agent
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Benchmark Sessions</p>
          <p className="text-2xl font-bold mt-1">{stats.totalBenchmarkSessions}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Vendor Observations</p>
          <p className="text-2xl font-bold mt-1">{stats.totalBenchmarkObservations}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Platforms</p>
          <div className="flex gap-3 mt-1">
            {Object.entries(stats.platformBreakdown).map(([platform, count]) => (
              <span key={platform} className="text-sm">
                <span className="text-gray-300 font-medium">{platform}</span>{" "}
                <span className="text-gray-500">{count}</span>
              </span>
            ))}
            {Object.keys(stats.platformBreakdown).length === 0 && (
              <span className="text-gray-500 text-sm">No benchmarks yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Cross-assistant vendor comparison */}
      {vendorComp.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Cross-Assistant Vendor Comparison</h2>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-4 py-3">Vendor</th>
                  <th className="text-right px-4 py-3">Claude Code</th>
                  <th className="text-right px-4 py-3">Codex CLI</th>
                  <th className="text-right px-4 py-3">Cursor</th>
                  <th className="text-right px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {vendorComp.slice(0, 30).map((row) => (
                  <tr key={row.vendor_canonical_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-2 font-medium">{row.vendor_canonical_id}</td>
                    <td className="px-4 py-2 text-right">
                      {row.claude_code_count > 0 ? (
                        <span className="text-blue-400">{row.claude_code_count}</span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.codex_cli_count > 0 ? (
                        <span className="text-green-400">{row.codex_cli_count}</span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.cursor_count > 0 ? (
                        <span className="text-purple-400">{row.cursor_count}</span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent benchmark sessions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Benchmark Sessions</h2>
        {sessions.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
            <p className="text-lg">No benchmark sessions yet</p>
            <p className="text-sm mt-2">
              Run <code className="bg-gray-700 px-2 py-1 rounded">bash scripts/benchmark.sh</code> to generate benchmark data
            </p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-4 py-3">Session</th>
                  <th className="text-left px-4 py-3">Platform</th>
                  <th className="text-left px-4 py-3">Model</th>
                  <th className="text-right px-4 py-3">Observations</th>
                  <th className="text-left px-4 py-3">Vendors</th>
                  <th className="text-left px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-2 font-mono text-xs">{s.id.slice(0, 12)}...</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        s.source_platform === "claude_code" ? "bg-blue-900/50 text-blue-300" :
                        s.source_platform === "codex_cli" ? "bg-green-900/50 text-green-300" :
                        "bg-purple-900/50 text-purple-300"
                      }`}>
                        {s.source_platform}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{s.model_id ?? "-"}</td>
                    <td className="px-4 py-2 text-right">{s.observation_count}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs truncate max-w-[200px]">
                      {s.vendors || "-"}
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{s.started_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
