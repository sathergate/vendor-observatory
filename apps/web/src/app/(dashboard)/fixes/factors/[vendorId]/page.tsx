import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FactorProfile } from "@/components/factors/FactorProfile";
import { ImprovementList } from "@/components/factors/ImprovementCard";
import { loadVendorFactors, getVendorFactors, getCategoryFactors } from "@/lib/load-vendor-factors";
import { generateImprovements } from "@/lib/factor-improvements";
import { vendorDisplayName, vendorCategory } from "@/lib/vendor-taxonomy";

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

const CONFIDENCE_LABELS: Record<string, { label: string; style: string }> = {
  high: { label: "Doc-sourced", style: "text-data-1 bg-data-1/10" },
  medium: { label: "Partially referenced", style: "text-data-3 bg-data-3/10" },
  low: { label: "Inferred", style: "text-muted bg-raised" },
};

export default async function VendorFactorPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const { vendorId: rawVendorId } = await params;
  const vendorId = decodeURIComponent(rawVendorId);
  const dataset = loadVendorFactors();
  const vendor = getVendorFactors(vendorId);

  if (!vendor) return notFound();

  const category = vendorCategory(vendorId);
  const categorySummary = category ? getCategoryFactors(category) : null;
  const improvements = generateImprovements(vendor, dataset.factors, categorySummary);
  const conf = CONFIDENCE_LABELS[vendor.confidence] ?? CONFIDENCE_LABELS.low;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Breadcrumb
          items={[
            { label: "Fixes" },
            { label: "Factor Analysis", href: "/fixes/factors" },
            { label: vendorDisplayName(vendorId) },
          ]}
        />
        <div className="flex items-center gap-3 mt-1">
          <h2 className="section-header">{vendorDisplayName(vendorId)}</h2>
          {category && (
            <Link
              href={`/fixes/factors/category/${category}`}
              className="px-2 py-0.5 rounded-[4px] text-[11px] bg-raised text-muted hover:text-secondary transition-colors"
            >
              {CATEGORY_LABELS[category] ?? category}
            </Link>
          )}
          <span className={`px-2 py-0.5 rounded-[4px] text-[11px] font-medium ${conf.style}`}>
            {conf.label}
          </span>
        </div>
        {vendor.notes && (
          <p className="text-[13px] text-muted italic mt-2 max-w-[600px]">{vendor.notes}</p>
        )}
      </div>

      {/* Factor bar chart */}
      <FactorProfile
        vendor={vendor}
        factors={dataset.factors}
        categorySummary={categorySummary}
      />

      {/* Improvement suggestions */}
      <div>
        <h3 className="section-header mb-3">
          Improvement Suggestions
          {improvements.length > 0 && (
            <span className="text-[12px] text-muted font-normal ml-2">
              ({improvements.length} identified)
            </span>
          )}
        </h3>
        <ImprovementList suggestions={improvements} />
      </div>

      {/* Competitive context */}
      {categorySummary && (
        <div className="bg-surface rounded-[6px] p-6 border border-border">
          <h3 className="section-header mb-4">
            Competitive Context
            <span className="text-[12px] text-muted font-normal ml-2">
              vs. {categorySummary.vendorCount} vendors in {CATEGORY_LABELS[category!] ?? category}
            </span>
          </h3>
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
                    Avg
                  </th>
                </tr>
              </thead>
              <tbody>
                {categorySummary.vendors
                  .sort((a, b) => b.compositeScore - a.compositeScore)
                  .map((v) => {
                    const isCurrentVendor = v.vendorId === vendorId;
                    return (
                      <tr
                        key={v.vendorId}
                        className={`border-b border-border-subtle transition-colors ${
                          isCurrentVendor ? "bg-accent/5" : "hover:bg-raised"
                        }`}
                      >
                        <td className="py-3 px-2">
                          {isCurrentVendor ? (
                            <span className="text-[13px] font-medium text-accent">
                              {vendorDisplayName(v.vendorId)}
                            </span>
                          ) : (
                            <Link
                              href={`/fixes/factors/${v.vendorId}`}
                              className="text-[13px] text-secondary hover:text-accent transition-colors"
                            >
                              {vendorDisplayName(v.vendorId)}
                            </Link>
                          )}
                        </td>
                        {dataset.factors.map((f) => {
                          const score = v.scores[f.id];
                          const catAvg = categorySummary.avgScores[f.id] ?? 0;
                          return (
                            <td key={f.id} className="text-center py-3 px-1">
                              <span
                                className={`font-data text-[13px] ${
                                  score == null
                                    ? "text-muted"
                                    : score < catAvg
                                      ? "text-data-4"
                                      : "text-primary"
                                }`}
                              >
                                {score ?? "—"}
                              </span>
                            </td>
                          );
                        })}
                        <td className="text-center py-3 px-2">
                          <span className="font-data text-[13px] text-secondary font-medium">
                            {v.compositeScore.toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
