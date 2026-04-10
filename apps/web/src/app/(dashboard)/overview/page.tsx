import Link from "next/link";
import type {
  BenchmarkRunRow,
  BenchmarkVendorCompRow,
  CategorySummary,
  IntentDistributionRow,
  DigestRow,
} from "@/lib/db";
import {
  getBenchmarkStats,
  getBenchmarkSessions,
  getBenchmarkVendorComparison,
  getCategorySummaries,
  getIntentDistribution,
  getLatestDigests,
} from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { PlatformBadge } from "@/components/PlatformBadge";
import { loadCategoryMeta } from "../benchmarks/categories";
import { PROMPT_COUNTS } from "../benchmarks/prompt-summaries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let stats = { totalBenchmarkSessions: 0, totalBenchmarkObservations: 0, platformBreakdown: {} as Record<string, number> };
  let sessions: BenchmarkRunRow[] = [];
  let vendorComp: BenchmarkVendorCompRow[] = [];
  let dbCategories: CategorySummary[] = [];
  let intentDist: IntentDistributionRow[] = [];
  let digests: DigestRow[] = [];

  try {
    [stats, sessions, vendorComp, dbCategories, intentDist, digests] = await Promise.all([
      getBenchmarkStats(),
      getBenchmarkSessions(50),
      getBenchmarkVendorComparison(),
      getCategorySummaries(),
      getIntentDistribution(),
      getLatestDigests(3),
    ]);
  } catch {
    // Degrade gracefully — page renders with empty/default data
  }

  // Load categories dynamically from DB (falls back to defaults if DB unavailable)
  const CATEGORY_META = await loadCategoryMeta();

  // Merge all categories from CATEGORY_META with any DB data
  const allCategories = Object.entries(CATEGORY_META).map(([key, meta]) => {
    const dbData = dbCategories.find((c) => c.category === key);
    return {
      key,
      meta,
      promptCount: dbData?.prompt_count ?? PROMPT_COUNTS[key] ?? 0,
      responseCount: dbData?.response_count ?? 0,
      topVendor: dbData?.top_vendor ?? null,
      topVendorCount: dbData?.top_vendor_count ?? 0,
      avgConstraintCoverage: dbData?.avg_constraint_coverage ?? 0,
      totalConstraints: dbData?.total_constraints ?? 0,
      hasData: !!dbData && dbData.response_count > 0,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[24px] font-bold text-primary">Benchmarks</h1>
        <p className="text-secondary mt-1">
          Automated daily benchmark runs across Claude Code, Codex CLI, and Cursor Agent
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface rounded-[6px] p-6 border border-border">
          <p className="stat-label">Benchmark Sessions</p>
          <p className="stat-hero mt-1">{stats.totalBenchmarkSessions.toLocaleString()}</p>
        </div>
        <div className="bg-surface rounded-[6px] p-6 border border-border">
          <p className="stat-label">Vendor Detections</p>
          <p className="stat-hero mt-1">{stats.totalBenchmarkObservations.toLocaleString()}</p>
        </div>
        <div className="bg-surface rounded-[6px] p-6 border border-border">
          <p className="stat-label">Platforms</p>
          <div className="flex gap-3 mt-1">
            {Object.entries(stats.platformBreakdown).map(([platform, count]) => (
              <span key={platform} className="flex items-center gap-1 text-[14px]">
                <PlatformBadge platform={platform} size="xs" />{" "}
                <span className="font-data text-muted">{count}</span>
              </span>
            ))}
            {Object.keys(stats.platformBreakdown).length === 0 && (
              <span className="text-muted text-[14px]">No benchmarks yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Developer Intent Distribution */}
      {intentDist.length > 0 && (
        <div>
          <h2 className="section-header mb-1">
            Developer Intent Distribution
          </h2>
          <p className="text-[14px] text-muted mb-3">
            What kinds of help developers seek — classified from prompt text
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {intentDist.map((d) => {
              const intentLabels: Record<string, { label: string; color: string }> = {
                evaluation: { label: "Evaluation", color: "text-data-3" },
                migration: { label: "Migration", color: "text-data-4" },
                greenfield: { label: "Greenfield", color: "text-data-5" },
                debugging: { label: "Debugging", color: "text-data-4" },
                architecture: { label: "Architecture", color: "text-data-1" },
                compliance: { label: "Compliance", color: "text-data-2" },
                cost_optimization: { label: "Cost Optimization", color: "text-data-5" },
              };
              const meta = intentLabels[d.intent] || { label: d.intent, color: "text-secondary" };

              return (
                <div key={d.intent} className="bg-surface rounded-[6px] p-4 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[14px] font-medium ${meta.color}`}>{meta.label}</span>
                  </div>
                  <p className="font-data text-[24px] text-primary">{d.count.toLocaleString()}</p>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[12px] text-muted font-data">{(d.pct * 100).toFixed(1)}% of prompts</span>
                    <span className="text-[12px] text-muted font-data">
                      conf: {(d.avg_confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  {d.top_vendor && (
                    <div className="mt-2 pt-2 border-t border-border-subtle">
                      <div className="flex justify-between text-[12px]">
                        <span className="text-muted">Top vendor</span>
                        <Link
                          href={`/benchmarks/vendors/${encodeURIComponent(d.top_vendor)}`}
                          className="text-accent hover:text-accent/80"
                        >
                          {vendorDisplayName(d.top_vendor)} ({d.top_vendor_count})
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Category cards — always show all 13 */}
      <div>
        <h2 className="section-header mb-3">Categories</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {allCategories.map((cat) => (
            <Link
              key={cat.key}
              href={`/benchmarks/${cat.key}`}
              className={`rounded-[6px] p-4 transition-all group ${
                cat.hasData
                  ? "bg-surface border border-border hover:bg-raised hover:border-border"
                  : "bg-surface/50 border border-dashed border-border-subtle hover:border-border hover:bg-surface/70"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[16px]">{cat.meta.icon}</span>
                <h3 className="font-semibold text-primary group-hover:text-accent transition-colors">
                  {cat.meta.label}
                </h3>
              </div>
              <p className="text-[12px] text-muted mb-3">{cat.meta.description}</p>

              {cat.hasData ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-[14px]">
                    <span className="text-secondary font-data">{cat.promptCount.toLocaleString()} prompts</span>
                    <span className="text-secondary font-data">{cat.responseCount.toLocaleString()} responses</span>
                  </div>
                  {cat.topVendor ? (
                    <div className="flex justify-between text-[14px]">
                      <span className="text-muted">Top vendor</span>
                      <span className="text-accent font-medium">
                        {cat.topVendor}
                        <span className="text-muted ml-1 font-data">({cat.topVendorCount})</span>
                      </span>
                    </div>
                  ) : (
                    <div className="text-[14px] text-muted">No detections yet</div>
                  )}
                  {cat.totalConstraints > 0 && (
                    <div>
                      <div className="flex justify-between text-[12px] text-muted mb-1">
                        <span>Constraint coverage</span>
                        <span className="font-data">{(cat.avgConstraintCoverage * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-data-muted rounded-[6px] h-1.5">
                        <div
                          className="bg-accent h-1.5 rounded-[6px] transition-all"
                          style={{ width: `${Math.min(100, Math.round(cat.avgConstraintCoverage * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-[14px]">
                    <span className="text-muted font-data">{cat.promptCount.toLocaleString()} prompts</span>
                    <span className="text-muted font-data">0 responses</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] px-2 py-0.5 rounded-[6px] bg-raised text-muted">
                      Awaiting data
                    </span>
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* Cross-assistant vendor comparison */}
      {vendorComp.length > 0 && (
        <div>
          <h2 className="section-header mb-3">Cross-Assistant Vendor Comparison</h2>
          <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="th-label text-left px-4 py-3">Vendor</th>
                  <th className="th-label text-right px-4 py-3">Claude Code</th>
                  <th className="th-label text-right px-4 py-3">Codex CLI</th>
                  <th className="th-label text-right px-4 py-3">Cursor</th>
                  <th className="th-label text-right px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {vendorComp.slice(0, 30).map((row) => (
                  <tr key={row.vendor_canonical_id} className="border-b border-border-subtle hover:bg-raised">
                    <td className="px-4 py-2 font-medium text-primary">{vendorDisplayName(row.vendor_canonical_id)}</td>
                    <td className="px-4 py-2 text-right">
                      {row.claude_code_count > 0 ? (
                        <span className="font-data text-data-1">{row.claude_code_count.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.codex_cli_count > 0 ? (
                        <span className="font-data text-data-2">{row.codex_cli_count.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.cursor_count > 0 ? (
                        <span className="font-data text-data-3">{row.cursor_count.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-data font-medium text-primary">{row.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily Digest */}
      {digests.length > 0 && (
        <div>
          <h2 className="section-header mb-3">Daily Digest</h2>
          <div className="space-y-3">
            {digests.map((d) => (
              <div key={d.run_date} className="bg-surface rounded-[6px] p-6 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[14px] font-medium text-primary">{d.run_date}</span>
                  {d.alerts.length > 0 && (
                    <div className="flex gap-1">
                      {d.alerts.map((alert, i) => (
                        <span
                          key={i}
                          className={`px-2 py-0.5 rounded-[6px] text-[12px] font-medium ${
                            alert.severity === "high"
                              ? "bg-data-4/20 text-data-4"
                              : alert.severity === "medium"
                                ? "bg-data-3/20 text-data-3"
                                : "bg-raised text-secondary"
                          }`}
                        >
                          {alert.message}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {d.summary && (
                  <p className="text-[14px] text-secondary leading-relaxed">{d.summary}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent benchmark sessions */}
      <div>
        <h2 className="section-header mb-3">Recent Benchmark Sessions</h2>
        {sessions.length === 0 ? (
          <div className="quiet-signal">
            <p className="text-[16px] text-secondary">No benchmark sessions yet</p>
            <p className="text-[14px] mt-2 text-muted">
              Run <code className="bg-raised px-2 py-1 rounded-[6px] font-mono text-primary">bash scripts/benchmark.sh</code> to generate benchmark data
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="th-label text-left px-4 py-3">Session</th>
                  <th className="th-label text-left px-4 py-3">Platform</th>
                  <th className="th-label text-left px-4 py-3">Model</th>
                  <th className="th-label text-right px-4 py-3">Detections</th>
                  <th className="th-label text-left px-4 py-3">Vendors</th>
                  <th className="th-label text-left px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-border-subtle hover:bg-raised">
                    <td className="px-4 py-2 font-mono text-[12px] text-secondary">{s.id.slice(0, 12)}...</td>
                    <td className="px-4 py-2">
                      <PlatformBadge platform={s.source_platform} />
                    </td>
                    <td className="px-4 py-2 text-secondary text-[12px]">{s.model_id ?? "-"}</td>
                    <td className="px-4 py-2 text-right font-data text-primary">{s.observation_count.toLocaleString()}</td>
                    <td className="px-4 py-2 text-secondary text-[12px] truncate max-w-[200px]">
                      {s.vendors || "-"}
                    </td>
                    <td className="px-4 py-2 text-muted text-[12px] font-data">{s.started_at?.slice(0, 10)}</td>
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
