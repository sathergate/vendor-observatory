import Link from "next/link";
import { getVendorScorecard, getCategoryCompetitorDensity } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SectionNav } from "@/components/SectionNav";
import { VendorGuard } from "@/components/VendorGuard";
import { CATEGORY_META } from "../../../categories";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default async function CategoryCompetitionPage({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor } = await params;
  const vendorId = decodeURIComponent(vendor);
  const [scorecard, categoryDensity] = await Promise.all([
    getVendorScorecard(vendorId),
    getCategoryCompetitorDensity(),
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
        <h1 className="text-2xl font-bold">Category Competition</h1>

        {!scorecard || scorecard.categoryBreakdown.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
            <p>No category data available yet.</p>
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
                  <div key={cat.category} id={`cat-${cat.category}`} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{catMeta?.icon ?? ""}</span>
                        <Link
                          href={`/benchmarks/${cat.category}`}
                          className="text-lg font-semibold text-gray-100 hover:text-blue-400 transition-colors"
                        >
                          {catMeta?.label ?? cat.category}
                        </Link>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="bg-gray-700/50 rounded p-3">
                        <p className="text-xs text-gray-400">Your Win Rate</p>
                        <p className={`text-lg font-bold ${
                          wr > 0.6 ? "text-green-400" : wr > 0.3 ? "text-yellow-400" : "text-red-400"
                        }`}>
                          {pct(wr)}
                        </p>
                      </div>
                      <div className="bg-gray-700/50 rounded p-3">
                        <p className="text-xs text-gray-400">Your Mentions</p>
                        <p className="text-lg font-bold text-gray-200">{cat.totalInCategory}</p>
                      </div>
                      <div className="bg-gray-700/50 rounded p-3">
                        <p className="text-xs text-gray-400">Total Vendors</p>
                        <p className="text-lg font-bold text-gray-200">{totalVendors}</p>
                      </div>
                      <div className="bg-gray-700/50 rounded p-3">
                        <p className="text-xs text-gray-400">Competitive Intensity</p>
                        <p className={`text-lg font-bold ${
                          totalVendors > 5 ? "text-red-400" : totalVendors > 3 ? "text-yellow-400" : "text-green-400"
                        }`}>
                          {totalVendors > 5 ? "High" : totalVendors > 3 ? "Medium" : "Low"}
                        </p>
                      </div>
                    </div>

                    {competitorsInCategory.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-400 mb-2">Competitors in this category</h3>
                        <div className="flex flex-wrap gap-2">
                          {competitorsInCategory.map((comp) => (
                            <Link
                              key={comp.competitor}
                              href={`/benchmarks/vendors/${encodeURIComponent(comp.competitor)}`}
                              className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-300 hover:bg-red-900/50 transition-colors"
                            >
                              {vendorDisplayName(comp.competitor)} ({comp.count} wins)
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {competitorsInCategory.length === 0 && (
                      <p className="text-sm text-gray-500">No direct competitors identified in this category yet.</p>
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
