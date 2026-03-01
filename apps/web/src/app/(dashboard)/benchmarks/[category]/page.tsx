import Link from "next/link";
import { notFound } from "next/navigation";
import { getEnrichmentByCategory, safeJsonParse } from "@/lib/db";
import { Breadcrumb } from "@/components/Breadcrumb";
import { loadCategoryMeta } from "../categories";
import { PROMPT_SUMMARIES, PROMPTS_BY_CATEGORY } from "../prompt-summaries";
import { CONTENT_TAG_LABELS, PATTERN_TAG_LABELS } from "../tag-labels";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const CATEGORY_META = await loadCategoryMeta();
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
            <h1 className="text-2xl font-bold text-primary">{meta.label}</h1>
            <p className="text-secondary mt-0.5">{meta.description}</p>
          </div>
        </div>
      </div>

      {/* Context blurb */}
      <div className="bg-surface border border-border rounded-[6px] px-4 py-3 text-[13px] text-secondary">
        Each prompt simulates a real developer scenario asking AI coding assistants to recommend
        a <span className="text-primary">{meta.label.toLowerCase()}</span> vendor.
        {hasResponses
          ? " Below: which vendors were recommended, how well they addressed constraints, and the reasoning behind each recommendation."
          : ` This category has ${promptIds.length} prompts defined. Benchmark data will appear after the next run.`}
      </div>

      {/* Key Findings card (only when data exists) */}
      {hasResponses && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface rounded-[6px] p-4 border border-border">
            <p className="stat-label">Top Vendor</p>
            <p className="text-[18px] font-bold text-accent mt-1 font-data">{topVendor?.primary_vendor ?? "—"}</p>
            {topVendor && <p className="stat-context">{topVendor.count.toLocaleString()} of {totalRecs.toLocaleString()} recommendations</p>}
          </div>
          <div className="bg-surface rounded-[6px] p-4 border border-border">
            <p className="stat-label">Responses</p>
            <p className="text-[18px] font-bold mt-1 font-data">{data.responses.length.toLocaleString()}</p>
            <p className="stat-context">across {data.prompts.length.toLocaleString()} prompts</p>
          </div>
          <div className="bg-surface rounded-[6px] p-4 border border-border">
            <p className="stat-label">Constraint Coverage</p>
            <p className="text-[18px] font-bold mt-1 font-data">{(avgCoverage * 100).toFixed(1)}%</p>
            <p className="stat-context">{totalConstraints.toLocaleString()} constraints tracked</p>
          </div>
          <div className="bg-surface rounded-[6px] p-4 border border-border">
            <p className="stat-label">Platforms Tested</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {platforms.length > 0 ? platforms.map((p) => (
                <span key={p} className={`px-2 py-0.5 rounded-[6px] text-[12px] ${
                  p === "claude_code" ? "bg-data-1/15 text-data-1" :
                  p === "codex_cli" ? "bg-data-2/15 text-data-2" :
                  "bg-data-3/15 text-data-3"
                }`}>{p}</span>
              )) : <span className="text-muted text-[13px]">—</span>}
            </div>
          </div>
        </div>
      )}

      {/* Vendor Leaderboard */}
      {data.vendorCounts.length > 0 && (
        <div>
          <h2 className="section-header mb-3">Vendor Leaderboard</h2>
          <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="th-label text-left px-4 py-3">#</th>
                  <th className="th-label text-left px-4 py-3">Vendor</th>
                  <th className="th-label text-right px-4 py-3">Recommendations</th>
                  <th className="th-label text-left px-4 py-3">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.vendorCounts.map((row, i) => {
                  const pct = totalRecs > 0 ? (row.count / totalRecs) * 100 : 0;
                  return (
                    <tr key={row.primary_vendor} className="border-b border-border-subtle hover:bg-raised h-12">
                      <td className="px-4 text-muted">{i + 1}</td>
                      <td className="px-4 font-medium text-accent">{row.primary_vendor}</td>
                      <td className="px-4 text-right font-data">{row.count.toLocaleString()}</td>
                      <td className="px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-raised rounded-[6px] h-2">
                            <div
                              className="bg-accent h-2 rounded-[6px] transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-secondary text-[12px] font-data">{pct.toFixed(1)}%</span>
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
        <h2 className="section-header mb-3">Prompt Breakdown</h2>
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
              <div key={prompt.prompt_id} className="bg-surface rounded-[6px] p-4 border border-border">
                {/* Prompt header: title + scenario */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-medium text-primary">
                      {summary?.title ?? prompt.prompt_id}
                    </h3>
                    {summary?.scenario && (
                      <p className="text-[13px] text-secondary mt-0.5">{summary.scenario}</p>
                    )}
                    <span className="text-muted font-mono text-[12px] mt-1 inline-block">{prompt.prompt_id}</span>
                  </div>
                  {responses.length > 0 && (
                    <div className="flex-shrink-0 text-right">
                      <span className="text-[13px] text-secondary">{responses.length} response{responses.length !== 1 ? "s" : ""}</span>
                      {topVendorEntry && (
                        <div className="text-[13px] mt-1">
                          <span className="text-muted">Top: </span>
                          <span className="text-accent font-medium">{topVendorEntry[0]}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Pain point */}
                {pm?.failure_mode && (
                  <div className="text-[13px] mt-3">
                    <span className="text-data-4/70 text-[12px] font-medium">Pain point:</span>{" "}
                    <span className="text-primary">{pm.failure_mode}</span>
                  </div>
                )}

                {/* Existing stack */}
                {existingStack.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[12px] text-muted">Stack:</span>
                    {existingStack.map((s) => (
                      <span key={s} className="px-1.5 py-0.5 bg-raised text-secondary text-[12px] rounded-[6px]">
                        {s.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}

                {/* Vendors named in prompt */}
                {vendorsNamed.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[12px] text-muted">Asked about:</span>
                    {vendorsNamed.map((v) => (
                      <span key={v} className="px-1.5 py-0.5 bg-accent-subtle text-accent/70 text-[12px] rounded-[6px]">
                        {v}
                      </span>
                    ))}
                  </div>
                )}

                {/* Tags — color-coded with friendly labels */}
                {(prompt.content_tags.length > 0 || prompt.pattern_tags.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {prompt.content_tags.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 bg-data-1/15 text-data-1 text-[12px] rounded-[6px]">
                        {CONTENT_TAG_LABELS[tag] ?? tag}
                      </span>
                    ))}
                    {prompt.pattern_tags.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 bg-data-3/15 text-data-3 text-[12px] rounded-[6px]">
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
                          className={`text-[12px] px-2 py-0.5 rounded-[6px] ${
                            responses.length === 0
                              ? "bg-raised text-muted"
                              : addressed
                                ? "bg-signal-strong/15 text-signal-strong"
                                : "bg-raised text-muted"
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
                  <div className="grid gap-2 mt-3 border-t border-border-subtle pt-3">
                    {responses.map((r) => (
                      <div key={r.id} className="bg-base rounded-[6px] p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Platform badge */}
                          <span className={`px-2 py-0.5 rounded-[6px] text-[12px] flex-shrink-0 ${
                            (r as { source_platform?: string }).source_platform === "claude_code" ? "bg-data-1/15 text-data-1" :
                            (r as { source_platform?: string }).source_platform === "codex_cli" ? "bg-data-2/15 text-data-2" :
                            "bg-data-3/15 text-data-3"
                          }`}>
                            {(r as { source_platform?: string }).source_platform ?? "unknown"}
                          </span>
                          {/* Status badge */}
                          <span className={`text-[12px] px-1.5 py-0.5 rounded-[6px] flex-shrink-0 ${
                            r.is_implemented
                              ? "bg-signal-strong/15 text-signal-strong"
                              : "bg-raised text-secondary"
                          }`}>
                            {r.is_implemented ? "Implemented" : "Recommended"}
                          </span>
                          {/* Vendor name */}
                          <span className="text-accent font-medium text-[13px] ml-auto">
                            {r.primary_vendor ?? "No primary vendor identified"}
                          </span>
                        </div>

                        {/* Rationale */}
                        {r.rationale_snippet && (
                          <p className="text-secondary text-[12px] leading-relaxed mt-2">
                            {r.rationale_snippet.slice(0, 250)}{r.rationale_snippet.length > 250 ? "..." : ""}
                          </p>
                        )}

                        {/* Trade-offs */}
                        {r.trade_offs_snippet && (
                          <p className="text-[12px] mt-1.5">
                            <span className="text-data-3/70 font-medium">Trade-offs: </span>
                            <span className="text-muted">
                              {r.trade_offs_snippet.slice(0, 200)}{r.trade_offs_snippet.length > 200 ? "..." : ""}
                            </span>
                          </p>
                        )}

                        {/* Gotchas */}
                        {r.gotchas_snippet && (
                          <p className="text-[12px] mt-1">
                            <span className="text-data-4/70 font-medium">Gotchas: </span>
                            <span className="text-muted">
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
          <h2 className="section-header mb-3">Constraint Coverage</h2>
          <div className="bg-surface rounded-[6px] p-4 space-y-3 border border-border">
            {data.constraintCoverage.map((row) => (
              <div key={row.constraint}>
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="text-primary">{row.constraint.replace(/_/g, " ")}</span>
                  <span className="text-muted font-data">
                    {row.addressed_count.toLocaleString()}/{row.total_count.toLocaleString()}
                    <span className="ml-2 text-secondary">{(row.coverage_pct * 100).toFixed(1)}%</span>
                  </span>
                </div>
                <div className="w-full bg-raised rounded-[6px] h-2">
                  <div
                    className={`h-2 rounded-[6px] transition-all ${
                      row.coverage_pct >= 0.75 ? "bg-signal-strong" :
                      row.coverage_pct >= 0.4 ? "bg-data-3" :
                      "bg-data-4"
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
