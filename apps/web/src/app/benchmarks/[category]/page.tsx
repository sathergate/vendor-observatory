import Link from "next/link";
import { notFound } from "next/navigation";
import { getEnrichmentByCategory } from "@/lib/db";
import { CATEGORY_META } from "../categories";

export const dynamic = "force-dynamic";

function safeJsonParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const meta = CATEGORY_META[category];
  if (!meta) notFound();

  const data = getEnrichmentByCategory(category);

  return (
    <div className="space-y-8">
      {/* Breadcrumb + Header */}
      <div>
        <Link href="/benchmarks" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
          ← Benchmarks
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-2xl">{meta.icon}</span>
          <div>
            <h1 className="text-2xl font-bold">{meta.label}</h1>
            <p className="text-gray-400 mt-0.5">{meta.description}</p>
          </div>
        </div>
        <div className="flex gap-4 mt-3 text-sm text-gray-400">
          <span>{data.prompts.length} prompts</span>
          <span>{data.responses.length} responses</span>
          <span>{data.vendorCounts.length} vendors recommended</span>
        </div>
      </div>

      {/* Empty state */}
      {data.responses.length === 0 && data.prompts.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 text-lg">No enrichment data yet</p>
          <p className="text-gray-500 text-sm mt-2">
            Data will appear after the next benchmark run with enriched prompts.
          </p>
        </div>
      ) : (
        <>
          {/* Vendor Leaderboard */}
          {data.vendorCounts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Vendor Leaderboard</h2>
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-400">
                      <th className="text-left px-4 py-3">#</th>
                      <th className="text-left px-4 py-3">Vendor</th>
                      <th className="text-right px-4 py-3">Recommendations</th>
                      <th className="text-left px-4 py-3">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.vendorCounts.map((row, i) => {
                      const totalRecs = data.vendorCounts.reduce((sum, v) => sum + v.count, 0);
                      const pct = totalRecs > 0 ? Math.round((row.count / totalRecs) * 100) : 0;
                      return (
                        <tr key={row.primary_vendor} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                          <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-blue-400">{row.primary_vendor}</td>
                          <td className="px-4 py-2 text-right">{row.count}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-gray-700 rounded-full h-2">
                                <div
                                  className="bg-blue-500 h-2 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-gray-400 text-xs">{pct}%</span>
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

          {/* Prompt Breakdown */}
          {data.prompts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Prompt Breakdown</h2>
              <div className="space-y-4">
                {data.prompts.map((prompt) => {
                  const pm = data.promptMetadata.find(m => m.prompt_id === prompt.prompt_id);
                  const responses = data.responses.filter(r => r.prompt_id === prompt.prompt_id);
                  const constraints = pm ? safeJsonParse<string[]>(pm.constraints, []) : prompt.constraints;
                  const topVendor = Object.entries(prompt.primary_vendors).sort((a, b) => b[1] - a[1])[0];

                  return (
                    <div key={prompt.prompt_id} className="bg-gray-800 rounded-lg p-4">
                      {/* Prompt header */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="font-medium text-gray-100">
                            <span className="text-gray-500 font-mono text-xs mr-2">{prompt.prompt_id}</span>
                          </h3>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {prompt.content_tags.map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 bg-gray-700 text-gray-400 text-xs rounded">
                                {tag}
                              </span>
                            ))}
                            {prompt.pattern_tags.map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 bg-gray-700/60 text-gray-500 text-xs rounded italic">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <span className="text-sm text-gray-400">{prompt.response_count} responses</span>
                          {topVendor && (
                            <div className="text-sm mt-1">
                              <span className="text-gray-500">Top: </span>
                              <span className="text-blue-400 font-medium">{topVendor[0]}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Constraint coverage */}
                      {constraints.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {constraints.map(c => {
                            const addressed = responses.some(r => {
                              const arr = safeJsonParse<string[]>(r.constraints_addressed, []);
                              return arr.includes(c);
                            });
                            return (
                              <span
                                key={c}
                                className={`text-xs px-2 py-0.5 rounded ${
                                  addressed
                                    ? "bg-green-900/40 text-green-400"
                                    : "bg-gray-700/50 text-gray-500"
                                }`}
                              >
                                {addressed ? "✓" : "○"} {c.replace(/_/g, " ")}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Per-response details */}
                      {responses.length > 0 && (
                        <div className="mt-3 border-t border-gray-700/50 pt-3 space-y-2">
                          {responses.map((r) => (
                            <div key={r.id} className="flex items-start gap-3 text-sm">
                              <span className={`px-2 py-0.5 rounded text-xs flex-shrink-0 ${
                                r.source_platform === "claude_code" ? "bg-blue-900/50 text-blue-300" :
                                r.source_platform === "codex_cli" ? "bg-green-900/50 text-green-300" :
                                "bg-purple-900/50 text-purple-300"
                              }`}>
                                {r.source_platform ?? "unknown"}
                              </span>
                              <span className="text-blue-400 font-medium flex-shrink-0 w-28 truncate">
                                {r.primary_vendor ?? "—"}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                                r.is_implemented
                                  ? "bg-green-900/30 text-green-400"
                                  : "bg-gray-700/50 text-gray-400"
                              }`}>
                                {r.is_implemented ? "implemented" : "recommended"}
                              </span>
                              {r.rationale_snippet && (
                                <span className="text-gray-500 text-xs truncate">
                                  {r.rationale_snippet.slice(0, 120)}{r.rationale_snippet.length > 120 ? "…" : ""}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Constraint Coverage Summary */}
          {data.constraintCoverage.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Constraint Coverage</h2>
              <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                {data.constraintCoverage.map(row => (
                  <div key={row.constraint}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{row.constraint.replace(/_/g, " ")}</span>
                      <span className="text-gray-500">
                        {row.addressed_count}/{row.total_count}
                        <span className="ml-2 text-gray-400">{Math.round(row.coverage_pct * 100)}%</span>
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          row.coverage_pct >= 0.75 ? "bg-green-500" :
                          row.coverage_pct >= 0.4 ? "bg-yellow-500" :
                          "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.round(row.coverage_pct * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
