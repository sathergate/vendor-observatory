import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FactorScale } from "@/components/factors/FactorDot";
import { loadVendorFactors, getCategoryFactors } from "@/lib/load-vendor-factors";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  database: "Database",
  ci_cd: "CI/CD",
  observability: "Observability",
  error_monitoring: "Error Monitoring",
  feature_flags: "Feature Flags",
  secrets_management: "Secrets Management",
  developer_portal: "Developer Portal",
  llm_observability: "LLM Observability",
  incident_management: "Incident Management",
  code_search: "Code Search",
  security_scanning: "Security Scanning",
  edge_compute: "Edge Compute",
};

export default async function CategoryFactorPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId: rawCategoryId } = await params;
  const categoryId = decodeURIComponent(rawCategoryId);
  const dataset = loadVendorFactors();
  const category = getCategoryFactors(categoryId);

  if (!category) return notFound();

  const categoryLabel = CATEGORY_LABELS[categoryId] ?? categoryId;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Breadcrumb
          items={[
            { label: "Fixes" },
            { label: "Factor Analysis", href: "/fixes/factors" },
            { label: categoryLabel },
          ]}
        />
        <h2 className="section-header">{categoryLabel}</h2>
        <p className="text-secondary text-[13px] mt-1">
          {category.vendorCount} vendors · Factor score distribution
        </p>
      </div>

      {/* Dot scale chart */}
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <h3 className="section-header mb-4">Factor Distribution</h3>
        <p className="text-[12px] text-muted mb-4">
          Each dot represents a vendor&apos;s score on a 1–5 scale. Hover for details.
        </p>
        <div className="space-y-1">
          {dataset.factors.map((f) => (
            <FactorScale
              key={f.id}
              factorLabel={f.short}
              vendors={category.vendors.map((v) => ({
                vendorId: v.vendorId,
                score: v.scores[f.id] ?? null,
              }))}
            />
          ))}
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <h3 className="section-header mb-4">Vendor Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-3 px-2 text-[12px] font-semibold uppercase tracking-wider text-secondary">
                  Vendor
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
                <th className="text-center py-3 px-2 text-[11px] font-semibold uppercase tracking-wider text-secondary">
                  Composite
                </th>
              </tr>
            </thead>
            <tbody>
              {category.vendors
                .sort((a, b) => b.compositeScore - a.compositeScore)
                .map((vendor) => (
                  <tr
                    key={vendor.vendorId}
                    className="border-b border-border-subtle hover:bg-raised transition-colors"
                  >
                    <td className="py-3 px-2">
                      <Link
                        href={`/fixes/factors/${vendor.vendorId}`}
                        className="text-[13px] text-secondary hover:text-accent transition-colors"
                      >
                        {vendorDisplayName(vendor.vendorId)}
                      </Link>
                    </td>
                    {dataset.factors.map((f) => {
                      const score = vendor.scores[f.id];
                      const avg = category.avgScores[f.id] ?? 0;
                      return (
                        <td key={f.id} className="text-center py-3 px-1">
                          <span
                            className={`
                              inline-flex items-center justify-center
                              w-7 h-7 rounded-[4px] font-data text-[13px]
                              ${score == null
                                ? "text-muted"
                                : score >= 4
                                  ? "bg-data-1/15 text-data-1"
                                  : score <= 2
                                    ? "bg-data-4/15 text-data-4"
                                    : score < avg
                                      ? "text-data-3"
                                      : "text-secondary"
                              }
                            `}
                          >
                            {score ?? "—"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="text-center py-3 px-2">
                      <span className="font-data text-[14px] text-primary font-medium">
                        {vendor.compositeScore.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              {/* Category averages row */}
              <tr className="border-t-2 border-border">
                <td className="py-3 px-2 text-[12px] text-muted uppercase font-semibold">
                  Category Avg
                </td>
                {dataset.factors.map((f) => (
                  <td key={f.id} className="text-center py-3 px-1">
                    <span className="font-data text-[12px] text-muted">
                      {(category.avgScores[f.id] ?? 0).toFixed(1)}
                    </span>
                  </td>
                ))}
                <td className="text-center py-3 px-2">
                  <span className="font-data text-[12px] text-muted">
                    {(
                      category.vendors.reduce((s, v) => s + v.compositeScore, 0) /
                      Math.max(category.vendors.length, 1)
                    ).toFixed(1)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Annotation */}
      <div className="border-l-2 border-data-muted pl-3 max-w-[480px]">
        <p className="text-[13px] text-muted italic">
          Scores reflect AI-assistant recommendation likelihood, not product quality.
          Color coding: green (4–5) = strong factor, red (1–2) = improvement opportunity,
          neutral (3) = average.
        </p>
      </div>
    </div>
  );
}
