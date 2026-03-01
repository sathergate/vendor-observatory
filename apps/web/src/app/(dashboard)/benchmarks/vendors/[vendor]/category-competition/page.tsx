import Link from "next/link";
import { getVendorScorecard, getCategoryCompetitorDensity } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SectionNav } from "@/components/SectionNav";
import { VendorGuard } from "@/components/VendorGuard";
import { loadCategoryMeta } from "../../../categories";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function CategoryCompetitionPage({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor } = await params;
  const vendorId = decodeURIComponent(vendor);
  const [scorecard, categoryDensity, CATEGORY_META] = await Promise.all([
    getVendorScorecard(vendorId),
    getCategoryCompetitorDensity(),
    loadCategoryMeta(),
  ]);

  const densityMap = new Map(categoryDensity.map(d => [d.work_category, d.vendor_count]));

  return (
    <div className="space-y-8">
      <Breadcrumb items={[
        { label: "Home", href: "/" },
        { label: vendorDisplayName(vendorId), href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}` },
        { label: "Category Competition" },
      ]} />

      <VendorGuard vendorId={vendorId}>
        <h1 className="text-2xl font-bold text-primary">Category Competition</h1>

        {!scorecard || scorecard.categoryBreakdown.length === 0 ? (
          <div className="quiet-signal">
            <p className="text-secondary">No category data available yet.</p>
          </div>
        ) : (
          <>
            <SectionNav sections={
              scorecard.categoryBreakdown.map(cat => ({
                id: `cat-${cat.category}`,
                label: CATEGORY_META[cat.category]?.label ?? cat.category,
              }))
            } />

            <div className="space-y-6">
              {scorecard.categoryBreakdown.map((cat) => {
                const catMeta = CATEGORY_META[cat.category];
                const wr = cat.totalInCategory > 0 ? cat.recommendations / cat.totalInCategory : 0;
                const totalVendors = densityMap.get(cat.category) ?? 0;
                const competitorsInCategory = scorecard.competitorWins.filter(cw =>
                  cw.scenarios.some(s => {
                    const lost = scorecard.promptsLost.find(p => p.prompt_id === s);
                    return lost?.category === cat.category;
                  })
                );

                return (
                  <div key={cat.category} id={`cat-${cat.category}`} className="bg-surface rounded-[6px] p-4 border border-border">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[20px]">{catMeta?.icon ?? ""}</span>
                        <Link
                          href={`/benchmarks/${cat.category}`}
                          className="text-[18px] font-semibold text-primary hover:text-accent transition-colors"
                        >
                          {catMeta?.label ?? cat.category}
                        </Link>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="bg-raised rounded-[6px] p-3">
                        <p className="stat-label">Your Win Rate</p>
                        <p className={`text-[18px] font-bold font-data ${
                          wr > 0.6 ? "text-signal-strong" : wr > 0.3 ? "text-data-3" : "text-data-4"
                        }`}>
                          {pct(wr)}
                        </p>
                      </div>
                      <div className="bg-raised rounded-[6px] p-3">
                        <p className="stat-label">Your Mentions</p>
                        <p className="text-[18px] font-bold text-primary font-data">{cat.totalInCategory.toLocaleString()}</p>
                      </div>
                      <div className="bg-raised rounded-[6px] p-3">
                        <p className="stat-label">Total Vendors</p>
                        <p className="text-[18px] font-bold text-primary font-data">{totalVendors.toLocaleString()}</p>
                      </div>
                      <div className="bg-raised rounded-[6px] p-3">
                        <p className="stat-label">Competitive Intensity</p>
                        <p className={`text-[18px] font-bold ${
                          totalVendors > 5 ? "text-data-4" : totalVendors > 3 ? "text-data-3" : "text-signal-strong"
                        }`}>
                          {totalVendors > 5 ? "High" : totalVendors > 3 ? "Medium" : "Low"}
                        </p>
                      </div>
                    </div>

                    {competitorsInCategory.length > 0 && (
                      <div>
                        <h3 className="text-[13px] font-medium text-secondary mb-2">Competitors in this category</h3>
                        <div className="flex flex-wrap gap-2">
                          {competitorsInCategory.map((comp) => (
                            <Link
                              key={comp.competitor}
                              href={`/benchmarks/vendors/${encodeURIComponent(comp.competitor)}`}
                              className="text-[12px] px-2 py-1 rounded-[6px] bg-data-4/15 text-data-4 hover:bg-data-4/25 transition-colors"
                            >
                              {vendorDisplayName(comp.competitor)} (<span className="font-data">{comp.count.toLocaleString()}</span> wins)
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {competitorsInCategory.length === 0 && (
                      <p className="text-[13px] text-muted">No direct competitors identified in this category yet.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </VendorGuard>
    </div>
  );
}
