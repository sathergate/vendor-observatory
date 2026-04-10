import Link from "next/link";
import { Breadcrumb } from "@/components/Breadcrumb";
import { StatCard } from "@/components/StatCard";
import {
  getConstraintInfluence,
  getConstraintCoverage,
  getConstraintDemand,
} from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function ConstraintSensitivityPage() {
  const [influence, coverage, demand] = await Promise.all([
    getConstraintInfluence(),
    getConstraintCoverage(),
    getConstraintDemand(),
  ]);

  const hasData = influence.length > 0 || coverage.length > 0 || demand.length > 0;

  // Compute summary stats
  const avgCoverage =
    coverage.length > 0
      ? coverage.reduce((sum, c) => sum + (c.coverage_pct ?? 0), 0) / coverage.length
      : 0;
  const highInfluenceCount = influence.filter((i) => i.influenceScore > 0.3).length;
  const topConstraint = demand.length > 0 ? demand[0] : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Breadcrumb items={[{ label: "Reasons", href: "/reasons/rejections" }, { label: "Constraint Sensitivity" }]} />
        <h2 className="section-header">Constraint Sensitivity</h2>
        <p className="text-secondary text-[13px] mt-1">
          How specific technical constraints affect vendor selection across AI coding assistants.
        </p>
      </div>

      {!hasData && (
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">No constraint data detected yet.</p>
          <p className="text-muted text-[13px] italic mt-2">
            Run benchmarks with constraint-rich prompts to populate this analysis.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="CONSTRAINTS TRACKED"
              value={demand.length.toLocaleString()}
              subtext="unique constraints across prompts"
            />
            <StatCard
              label="AVG COVERAGE RATE"
              value={pct(avgCoverage / 100)}
              subtext="of constraints addressed in responses"
            />
            <StatCard
              label="HIGH-INFLUENCE"
              value={highInfluenceCount.toLocaleString()}
              subtext="constraints that shift vendor preference"
              valueClassName={highInfluenceCount > 0 ? "text-data-4" : ""}
            />
            <StatCard
              label="MOST DEMANDED"
              value={topConstraint?.constraint.replace(/_/g, " ") ?? "\u2014"}
              subtext={topConstraint ? `${topConstraint.prompt_count} prompts` : ""}
            />
          </div>

          {/* Constraint Influence Ranking */}
          {influence.length > 0 && (
            <section className="space-y-4">
              <h3 className="section-header">Constraint Influence on Vendor Selection</h3>
              <p className="text-[13px] text-secondary">
                Constraints ranked by how much they shift which vendor gets recommended.
                Higher influence means this constraint strongly favors or disfavors specific vendors.
              </p>
              <div className="space-y-3">
                {influence.map((ci) => (
                  <div key={ci.constraint} className="bg-surface rounded-[6px] p-5 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[13px] text-accent">
                        {ci.constraint.replace(/_/g, " ")}
                      </span>
                      <span className="text-[12px] text-secondary">
                        Influence: <span className="font-data">{ci.influenceScore.toFixed(2)}</span>
                      </span>
                    </div>
                    {/* Influence bar */}
                    <div className="flex-1 bg-raised rounded-[6px] h-2 mb-3">
                      <div
                        className="bg-accent h-full rounded-[6px]"
                        style={{ width: `${Math.min(100, ci.influenceScore * 100)}%` }}
                      />
                    </div>
                    {/* Vendor shifts */}
                    {ci.vendorShifts.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {ci.vendorShifts.slice(0, 8).map((vs) => (
                          <div key={vs.vendor} className="bg-raised rounded-[6px] p-2">
                            <Link
                              href={`/benchmarks/vendors/${encodeURIComponent(vs.vendor)}`}
                              className="text-[12px] text-primary hover:text-accent"
                            >
                              {vendorDisplayName(vs.vendor)}
                            </Link>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] text-muted">
                                {pct(vs.winRateWithout)}
                              </span>
                              <span className="text-muted text-[10px]">{"\u2192"}</span>
                              <span className="text-[11px] text-muted">
                                {pct(vs.winRateWith)}
                              </span>
                              <span
                                className={`text-[11px] font-data font-medium ml-auto ${
                                  vs.delta > 0 ? "text-data-5" : vs.delta < 0 ? "text-data-4" : "text-muted"
                                }`}
                              >
                                {vs.delta > 0 ? "+" : ""}{pct(vs.delta)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Constraint Demand Table */}
          {demand.length > 0 && (
            <section className="space-y-4">
              <h3 className="section-header">Constraint Demand &amp; Coverage</h3>
              <p className="text-[13px] text-secondary">
                How often each constraint appears in prompts and which vendor addresses it most.
              </p>
              <div className="bg-surface rounded-[6px] border border-border overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="th-label text-left px-4 h-12">Constraint</th>
                      <th className="th-label text-right px-4 h-12">Prompts</th>
                      <th className="th-label text-right px-4 h-12">Responses</th>
                      <th className="th-label text-right px-4 h-12">Coverage</th>
                      <th className="th-label text-left px-4 h-12">Top Vendor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demand.map((d) => (
                      <tr key={d.constraint} className="border-b border-border-subtle hover:bg-raised h-12">
                        <td className="px-4 py-2 font-mono text-[12px] text-primary">
                          {d.constraint.replace(/_/g, " ")}
                        </td>
                        <td className="px-4 py-2 text-right font-data text-secondary">
                          {d.prompt_count}
                        </td>
                        <td className="px-4 py-2 text-right font-data text-secondary">
                          {d.response_count}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-data ${
                            d.coverage_rate > 0.7 ? "text-data-5" : d.coverage_rate > 0.4 ? "text-data-3" : "text-data-4"
                          }`}>
                            {pct(d.coverage_rate)}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {d.top_vendor ? (
                            <Link
                              href={`/benchmarks/vendors/${encodeURIComponent(d.top_vendor)}`}
                              className="text-accent hover:text-accent/80 text-[12px]"
                            >
                              {vendorDisplayName(d.top_vendor)}
                              <span className="text-muted ml-1">({d.top_vendor_count})</span>
                            </Link>
                          ) : (
                            <span className="text-muted">{"\u2014"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Coverage Breakdown */}
          {coverage.length > 0 && (
            <section className="space-y-4">
              <h3 className="section-header">Coverage Rates by Constraint</h3>
              <p className="text-[13px] text-secondary">
                Percentage of responses that successfully address each constraint when it appears in the prompt.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {coverage.slice(0, 18).map((c) => (
                  <div key={c.constraint} className="bg-surface rounded-[6px] p-4 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] text-primary font-medium">
                        {c.constraint.replace(/_/g, " ")}
                      </span>
                      <span className={`font-data text-[14px] font-medium ${
                        c.coverage_pct > 70 ? "text-data-5" : c.coverage_pct > 40 ? "text-data-3" : "text-data-4"
                      }`}>
                        {c.coverage_pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="bg-raised rounded-[6px] h-2">
                      <div
                        className={`h-full rounded-[6px] ${
                          c.coverage_pct > 70 ? "bg-data-5/60" : c.coverage_pct > 40 ? "bg-data-3/60" : "bg-data-4/60"
                        }`}
                        style={{ width: `${Math.min(100, c.coverage_pct)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted mt-1">
                      {c.addressed_count} of {c.total_count} responses
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Annotation */}
          <div className="border-l-2 border-data-muted pl-3 max-w-[480px]">
            <p className="text-[13px] text-muted italic">
              Constraint influence is measured by comparing vendor win rates when a constraint
              is present vs. absent. High influence means this constraint is a deciding factor
              in which vendor gets recommended.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
