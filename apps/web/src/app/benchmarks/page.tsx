import Link from "next/link";
import {
  getBenchmarkStats,
  getBenchmarkSessions,
  getBenchmarkVendorComparison,
  getCategorySummaries,
} from "@/lib/db";
import { CATEGORY_META } from "./categories";

export const dynamic = "force-dynamic";

export default function BenchmarksPage() {
  const stats = getBenchmarkStats();
  const sessions = getBenchmarkSessions(50);
  const vendorComp = getBenchmarkVendorComparison();
  const categories = getCategorySummaries();

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

      {/* Category cards */}
      {categories.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold mb-3">Categories</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {categories.map((cat) => {
              const meta = CATEGORY_META[cat.category] ?? { label: cat.category, icon: "📦", description: "" };
              return (
                <Link
                  key={cat.category}
                  href={`/benchmarks/${cat.category}`}
                  className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 hover:ring-1 hover:ring-gray-600 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{meta.icon}</span>
                    <h3 className="font-semibold text-gray-100 group-hover:text-blue-400 transition-colors">
                      {meta.label}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{meta.description}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{cat.prompt_count} prompts</span>
                      <span className="text-gray-400">{cat.response_count} responses</span>
                    </div>
                    {cat.top_vendor ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Top vendor</span>
                        <span className="text-blue-400 font-medium">
                          {cat.top_vendor}
                          <span className="text-gray-500 ml-1">({cat.top_vendor_count})</span>
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600">No recommendations yet</div>
                    )}
                    {cat.total_constraints > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Constraint coverage</span>
                          <span>{Math.round(cat.avg_constraint_coverage * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.round(cat.avg_constraint_coverage * 100))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400">Category enrichment data will appear after the next benchmark run</p>
          <p className="text-xs text-gray-500 mt-1">Prompts have been updated with enrichment metadata</p>
        </div>
      )}

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
