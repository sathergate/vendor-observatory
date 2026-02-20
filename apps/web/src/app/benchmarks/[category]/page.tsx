import Link from "next/link";
import { notFound } from "next/navigation";
import { getEnrichmentByCategory, safeJsonParse } from "@/lib/db";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CATEGORY_META } from "../categories";
import { PROMPT_SUMMARIES, PROMPTS_BY_CATEGORY } from "../prompt-summaries";
import { CONTENT_TAG_LABELS, PATTERN_TAG_LABELS } from "../tag-labels";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const meta = CATEGORY_META[category];
  if (!meta) notFound();

  const data = await getEnrichmentByCategory(category);
  const promptIds = PROMPTS_BY_CATEGORY[category] ?? [];
  const hasResponses = data.responses.length > 0;
  const totalRecs = data.vendorCounts.reduce((sum, v) => sum + v.count, 0);
  const topVendor = data.vendorCounts[0] ?? null;
  const platforms = [...new Set(data.responses.map((r) => (r as { source_platform?: string }).source_platform).filter(Boolean))];
  const totalConstraints = data.constraintCoverage.length;
  const avgCoverage = totalConstraints > 0
    ? data.constraintCoverage.reduce((sum, c) => sum + c.coverage_pct, 0) / totalConstraints
    : 0;

  return (
    <div className="space-y-8">
      {/* Breadcrumb + Header */}
      <div>
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: meta.label }]} />
        <div className="flex items-center gap-3 mt-2">
          <span className="text-2xl">{meta.icon}</span>
          <div>
            <h1 className="text-2xl font-bold">{meta.label}</h1>
            <p className="text-gray-400 mt-0.5">{meta.description}</p>
          </div>
        </div>
      </div>

      {/* Context blurb */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-400">
        Each prompt simulates a real developer scenario asking AI coding assistants to recommend
        a <span className="text-gray-300">{meta.label.toLowerCase()}</span> vendor.
        {hasResponses
          ? " Below: which vendors were recommended, how well they addressed constraints, and the reasoning behind each recommendation."
          : ` This category has ${promptIds.length} prompts defined. Benchmark data will appear after the next run.`}
      </div>

      {/* Key Findings card (only when data exists) */}
      {hasResponses && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500">Top Vendor</p>
            <p className="text-lg font-bold text-blue-400 mt-1">{topVendor?.primary_vendor ?? "—"}</p>
            {topVendor && <p className="text-xs text-gray-500">{topVendor.count} of {totalRecs} recommendations</p>}
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500">Responses</p>
            <p className="text-lg font-bold mt-1">{data.responses.length}</p>
            <p className="text-xs text-gray-500">across {data.prompts.length} prompts</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500">Constraint Coverage</p>
            <p className="text-lg font-bold mt-1">{Math.round(avgCoverage * 100)}%</p>
            <p className="text-xs text-gray-500">{totalConstraints} constraints tracked</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500">Platforms Tested</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {platforms.length > 0 ? platforms.map((p) => (
                <span key={p} className={`px-2 py-0.5 rounded text-xs ${
                  p === "claude_code" ? "bg-blue-900/50 text-blue-300" :
                  p === "codex_cli" ? "bg-green-900/50 text-green-300" :
                  "bg-purple-900/50 text-purple-300"
                }`}>{p}</span>
              )) : <span className="text-gray-600 text-sm">—</span>}
            </div>
          </div>
        </div>
      )}

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
      <div>
        <h2 className="text-lg font-semibold mb-3">Prompt Breakdown</h2>
        <div className="space-y-4">
          {(hasResponses ? data.prompts : promptIds.map((id) => ({
            prompt_id: id,
            category,
            content_tags: [] as string[],
            pattern_tags: [] as string[],
            constraints: [] as string[],
            response_count: 0,
            primary_vendors: {} as Record<string, number>,
            avg_constraints_covered: 0,
            implementation_rate: 0,
          }))).map((prompt) => {
            const summary = PROMPT_SUMMARIES[prompt.prompt_id];
            const pm = data.promptMetadata.find((m) => m.prompt_id === prompt.prompt_id);
            const responses = data.responses.filter((r) => r.prompt_id === prompt.prompt_id);
            const constraints = pm ? safeJsonParse<string[]>(pm.constraints, []) : prompt.constraints;
            const existingStack = pm ? safeJsonParse<string[]>(pm.existing_stack, []) : [];
            const vendorsNamed = pm ? safeJsonParse<string[]>(pm.vendors_named_in_prompt, []) : [];
            const topVendorEntry = Object.entries(prompt.primary_vendors).sort((a, b) => b[1] - a[1])[0];

            return (
              <div key={prompt.prompt_id} className="bg-gray-800 rounded-lg p-4">
                {/* Prompt header: title + scenario */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-medium text-gray-100">
                      {summary?.title ?? prompt.prompt_id}
                    </h3>
                    {summary?.scenario && (
                      <p className="text-sm text-gray-400 mt-0.5">{summary.scenario}</p>
                    )}
                    <span className="text-gray-600 font-mono text-xs mt-1 inline-block">{prompt.prompt_id}</span>
                  </div>
                  {responses.length > 0 && (
                    <div className="flex-shrink-0 text-right">
                      <span className="text-sm text-gray-400">{responses.length} response{responses.length !== 1 ? "s" : ""}</span>
                      {topVendorEntry && (
                        <div className="text-sm mt-1">
                          <span className="text-gray-500">Top: </span>
                          <span className="text-blue-400 font-medium">{topVendorEntry[0]}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Pain point */}
                {pm?.failure_mode && (
                  <div className="text-sm mt-3">
                    <span className="text-red-400/70 text-xs font-medium">Pain point:</span>{" "}
                    <span className="text-gray-300">{pm.failure_mode}</span>
                  </div>
                )}

                {/* Existing stack */}
                {existingStack.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-xs text-gray-500">Stack:</span>
                    {existingStack.map((s) => (
                      <span key={s} className="px-1.5 py-0.5 bg-gray-700/50 text-gray-400 text-xs rounded">
                        {s.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}

                {/* Vendors named in prompt */}
                {vendorsNamed.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-xs text-gray-500">Asked about:</span>
                    {vendorsNamed.map((v) => (
                      <span key={v} className="px-1.5 py-0.5 bg-blue-900/20 text-blue-400/70 text-xs rounded">
                        {v}
                      </span>
                    ))}
                  </div>
                )}

                {/* Tags — color-coded with friendly labels */}
                {(prompt.content_tags.length > 0 || prompt.pattern_tags.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {prompt.content_tags.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 bg-blue-900/30 text-blue-400 text-xs rounded">
                        {CONTENT_TAG_LABELS[tag] ?? tag}
                      </span>
                    ))}
                    {prompt.pattern_tags.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 bg-purple-900/30 text-purple-400 text-xs rounded">
                        {PATTERN_TAG_LABELS[tag] ?? tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Constraint coverage badges */}
                {constraints.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {constraints.map((c) => {
                      const addressed = responses.some((r) => {
                        const arr = safeJsonParse<string[]>(r.constraints_addressed, []);
                        return arr.includes(c);
                      });
                      return (
                        <span
                          key={c}
                          className={`text-xs px-2 py-0.5 rounded ${
                            responses.length === 0
                              ? "bg-gray-700/30 text-gray-600"
                              : addressed
                                ? "bg-green-900/40 text-green-400"
                                : "bg-gray-700/50 text-gray-500"
                          }`}
                        >
                          {responses.length === 0 ? "○" : addressed ? "✓" : "✗"} {c.replace(/_/g, " ")}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Per-response detail cards */}
                {responses.length > 0 && (
                  <div className="grid gap-2 mt-3 border-t border-gray-700/50 pt-3">
                    {responses.map((r) => (
                      <div key={r.id} className="bg-gray-900/50 rounded p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Platform badge */}
                          <span className={`px-2 py-0.5 rounded text-xs flex-shrink-0 ${
                            (r as { source_platform?: string }).source_platform === "claude_code" ? "bg-blue-900/50 text-blue-300" :
                            (r as { source_platform?: string }).source_platform === "codex_cli" ? "bg-green-900/50 text-green-300" :
                            "bg-purple-900/50 text-purple-300"
                          }`}>
                            {(r as { source_platform?: string }).source_platform ?? "unknown"}
                          </span>
                          {/* Status badge */}
                          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                            r.is_implemented
                              ? "bg-green-900/30 text-green-400"
                              : "bg-gray-700/50 text-gray-400"
                          }`}>
                            {r.is_implemented ? "Implemented" : "Recommended"}
                          </span>
                          {/* Vendor name */}
                          <span className="text-blue-400 font-medium text-sm ml-auto">
                            {r.primary_vendor ?? "No primary vendor identified"}
                          </span>
                        </div>

                        {/* Rationale */}
                        {r.rationale_snippet && (
                          <p className="text-gray-400 text-xs leading-relaxed mt-2">
                            {r.rationale_snippet.slice(0, 250)}{r.rationale_snippet.length > 250 ? "..." : ""}
                          </p>
                        )}

                        {/* Trade-offs */}
                        {r.trade_offs_snippet && (
                          <p className="text-xs mt-1.5">
                            <span className="text-yellow-400/70 font-medium">Trade-offs: </span>
                            <span className="text-gray-500">
                              {r.trade_offs_snippet.slice(0, 200)}{r.trade_offs_snippet.length > 200 ? "..." : ""}
                            </span>
                          </p>
                        )}

                        {/* Gotchas */}
                        {r.gotchas_snippet && (
                          <p className="text-xs mt-1">
                            <span className="text-orange-400/70 font-medium">Gotchas: </span>
                            <span className="text-gray-500">
                              {r.gotchas_snippet.slice(0, 200)}{r.gotchas_snippet.length > 200 ? "..." : ""}
                            </span>
                          </p>
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

      {/* Constraint Coverage Summary */}
      {data.constraintCoverage.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Constraint Coverage</h2>
          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            {data.constraintCoverage.map((row) => (
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
    </div>
  );
}
