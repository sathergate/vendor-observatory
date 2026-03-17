import { Breadcrumb } from "@/components/Breadcrumb";
import { StatCard } from "@/components/StatCard";
import { FactorHeatmap } from "@/components/factors/FactorHeatmap";
import { loadVendorFactors } from "@/lib/load-vendor-factors";
import { computeAnalyticsStats } from "@/lib/factor-improvements";

export const dynamic = "force-dynamic";

export default function FactorAnalysisPage() {
  const dataset = loadVendorFactors();
  const stats = computeAnalyticsStats(dataset.vendors, dataset.factors, dataset.globalAvg);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Breadcrumb items={[{ label: "Fixes" }, { label: "Factor Analysis" }]} />
        <h2 className="section-header">Factor Analysis</h2>
        <p className="text-secondary text-[13px] mt-1">
          How vendors score across the 10 AI-recommendation factors.
          Scores derived from{" "}
          <span className="text-muted italic">vendor-selection-principles.md</span>.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="AVG COMPOSITE SCORE"
          value={`${stats.avgCompositeScore}`}
          subtext={`across ${dataset.vendors.length} vendors`}
        />
        <StatCard
          label="CRITICAL IMPROVEMENTS"
          value={`${stats.criticalCount}`}
          subtext="score ≤ 2 on very-high-weight factors"
          valueClassName={stats.criticalCount > 0 ? "text-data-4" : ""}
        />
        <StatCard
          label="WEAKEST FACTOR"
          value={stats.weakestFactor.label}
          subtext={`avg ${stats.weakestFactor.avgScore} / 5`}
        />
        <StatCard
          label="STRONGEST FACTOR"
          value={stats.strongestFactor.label}
          subtext={`avg ${stats.strongestFactor.avgScore} / 5`}
        />
      </div>

      {/* Heatmap */}
      <FactorHeatmap factors={dataset.factors} byCategory={dataset.byCategory} />

      {/* Category summary table */}
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <h3 className="section-header mb-4">Category Averages</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-3 px-2 text-[12px] font-semibold uppercase tracking-wider text-secondary">
                  Category
                </th>
                <th className="text-center py-3 px-1 text-[12px] font-semibold uppercase tracking-wider text-secondary">
                  Vendors
                </th>
                {dataset.factors.map((f) => (
                  <th
                    key={f.id}
                    className="text-center py-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted"
                    title={f.label}
                  >
                    {f.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(dataset.byCategory)
                .sort(([, a], [, b]) => b.vendorCount - a.vendorCount)
                .map(([catId, cat]) => {
                  const catLabels: Record<string, string> = {
                    database: "Database",
                    ci_cd: "CI/CD",
                    observability: "Observability",
                    error_monitoring: "Error Monitoring",
                    feature_flags: "Feature Flags",
                    secrets_management: "Secrets Mgmt",
                    developer_portal: "Dev Portal",
                    llm_observability: "LLM Observability",
                    incident_management: "Incident Mgmt",
                    code_search: "Code Search",
                    security_scanning: "Security Scan",
                    edge_compute: "Edge Compute",
                  };
                  return (
                    <tr key={catId} className="border-b border-border-subtle hover:bg-raised transition-colors">
                      <td className="py-3 px-2 text-[13px] text-primary">
                        {catLabels[catId] ?? catId}
                      </td>
                      <td className="py-3 px-1 text-center font-data text-[13px] text-secondary">
                        {cat.vendorCount}
                      </td>
                      {dataset.factors.map((f) => {
                        const avg = cat.avgScores[f.id] ?? 0;
                        const pct = (avg / 5) * 100;
                        return (
                          <td key={f.id} className="py-3 px-1">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="font-data text-[12px] text-secondary">
                                {avg.toFixed(1)}
                              </span>
                              <div className="w-full h-1 bg-raised rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${avg >= 3.5 ? "bg-data-1/70" : avg >= 2.5 ? "bg-data-muted" : "bg-data-4/70"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Annotation */}
      <div className="border-l-2 border-data-muted pl-3 max-w-[480px]">
        <p className="text-[13px] text-muted italic">
          Scores reflect AI-recommendation readiness based on training data presence,
          integration simplicity, and ecosystem fit — not absolute product quality.
          Confidence flags indicate whether scores are derived from the principles document
          (high) or inferred from general knowledge (medium/low).
        </p>
      </div>
    </div>
  );
}
