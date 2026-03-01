import Link from "next/link";
import { getVendorScorecard } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SectionNav } from "@/components/SectionNav";
import { VendorGuard } from "@/components/VendorGuard";
import { loadCategoryMeta } from "../../../categories";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default async function UseCasesPage({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor } = await params;
  const vendorId = decodeURIComponent(vendor);
  const [scorecard, CATEGORY_META] = await Promise.all([
    getVendorScorecard(vendorId),
    loadCategoryMeta(),
  ]);

  return (
    <div className="space-y-8">
      <Breadcrumb items={[
        { label: "Home", href: "/" },
        { label: vendorDisplayName(vendorId), href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}` },
        { label: "Use Cases" },
      ]} />

      <VendorGuard vendorId={vendorId}>
        <h1 className="text-2xl font-bold">Use Cases</h1>

        {!scorecard || scorecard.categoryBreakdown.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
            <p>No category data available yet.</p>
          </div>
        ) : (
          <>
            <SectionNav sections={[
              { id: "dominant", label: "Top Category" },
              { id: "category-table", label: "All Categories" },
              { id: "platform-categories", label: "By Platform" },
            ]} />

            {/* Dominant Category Highlight */}
            <div id="dominant">
              <h2 className="text-lg font-semibold mb-3">Dominant Category</h2>
              {(() => {
                const sorted = [...scorecard.categoryBreakdown].sort(
                  (a, b) => b.totalInCategory - a.totalInCategory
                );
                const top = sorted[0];
                const topMeta = CATEGORY_META[top.category];
                const maxMentions = top.totalInCategory;
                return (
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">{topMeta?.icon ?? ""}</span>
                      <div>
                        <Link
                          href={`/benchmarks/${top.category}`}
                          className="text-lg font-semibold text-gray-100 hover:text-blue-400 transition-colors"
                        >
                          {topMeta?.label ?? top.category}
                        </Link>
                        <p className="text-sm text-gray-500">{top.totalInCategory} total mentions</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {sorted.map((cat) => {
                        const meta = CATEGORY_META[cat.category];
                        const width = maxMentions > 0 ? (cat.totalInCategory / maxMentions) * 100 : 0;
                        return (
                          <div key={cat.category} className="flex items-center gap-3">
                            <span className="w-24 text-sm text-gray-400 truncate">
                              {meta?.icon ?? ""} {meta?.label ?? cat.category}
                            </span>
                            <div className="flex-1 bg-gray-700 rounded-full h-3">
                              <div
                                className="bg-blue-500/70 h-3 rounded-full transition-all"
                                style={{ width: `${Math.max(2, width)}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-400 w-8 text-right">{cat.totalInCategory}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Category Table */}
            <div id="category-table">
              <h2 className="text-lg font-semibold mb-3">Category Breakdown</h2>
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-400">
                      <th className="text-left px-4 py-3">Category</th>
                      <th className="text-right px-4 py-3">Recommended</th>
                      <th className="text-right px-4 py-3">Compared</th>
                      <th className="text-right px-4 py-3">Rejected</th>
                      <th className="text-right px-4 py-3">Total</th>
                      <th className="text-right px-4 py-3">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorecard.categoryBreakdown.map((cat) => {
                      const catMeta = CATEGORY_META[cat.category];
                      const wr = cat.totalInCategory > 0 ? cat.recommendations / cat.totalInCategory : 0;
                      return (
                        <tr key={cat.category} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                          <td className="px-4 py-2">
                            <Link href={`/benchmarks/${cat.category}`} className="hover:text-blue-400 transition-colors">
                              {catMeta ? `${catMeta.icon} ${catMeta.label}` : cat.category}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-right text-blue-400 font-medium">
                            {cat.recommendations > 0 ? cat.recommendations : <span className="text-gray-600">-</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-yellow-400">
                            {cat.comparisons > 0 ? cat.comparisons : <span className="text-gray-600">-</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-red-400">
                            {cat.rejections > 0 ? cat.rejections : <span className="text-gray-600">-</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-400">{cat.totalInCategory}</td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-medium ${
                              wr > 0.6 ? "text-green-400" : wr > 0.3 ? "text-yellow-400" : "text-red-400"
                            }`}>
                              {pct(wr)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Platform Split per Category */}
            <div id="platform-categories">
              <h2 className="text-lg font-semibold mb-3">Platform Split by Category</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scorecard.categoryBreakdown.map((cat) => {
                  const catMeta = CATEGORY_META[cat.category];
                  const platformCounts: Record<string, number> = {};
                  for (const ctx of scorecard.implementationContext) {
                    if (ctx.category === cat.category) {
                      platformCounts[ctx.platform] = (platformCounts[ctx.platform] || 0) + 1;
                    }
                  }
                  if (Object.keys(platformCounts).length === 0) return null;
                  return (
                    <div key={cat.category} className="bg-gray-800 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-gray-300 mb-2">
                        {catMeta ? `${catMeta.icon} ${catMeta.label}` : cat.category}
                      </h3>
                      <div className="flex gap-2">
                        {Object.entries(platformCounts).map(([platform, count]) => (
                          <span
                            key={platform}
                            className={`text-xs px-2 py-1 rounded ${
                              platform === "claude_code" ? "bg-blue-900/50 text-blue-300" :
                              platform === "codex_cli" ? "bg-green-900/50 text-green-300" :
                              "bg-purple-900/50 text-purple-300"
                            }`}
                          >
                            {platform}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </VendorGuard>
    </div>
  );
}
