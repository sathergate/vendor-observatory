import Link from "next/link";
import { getVendorScorecard } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SectionNav } from "@/components/SectionNav";
import { VendorGuard } from "@/components/VendorGuard";
import { loadCategoryMeta } from "../../../categories";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
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
        <h1 className="text-2xl font-bold text-primary">Use Cases</h1>

        {!scorecard || scorecard.categoryBreakdown.length === 0 ? (
          <div className="quiet-signal">
            <p className="text-secondary">No category data available yet.</p>
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
              <h2 className="section-header mb-3">Dominant Category</h2>
              {(() => {
                const sorted = [...scorecard.categoryBreakdown].sort(
                  (a, b) => b.totalInCategory - a.totalInCategory
                );
                const top = sorted[0];
                const topMeta = CATEGORY_META[top.category];
                const maxMentions = top.totalInCategory;
                return (
                  <div className="bg-surface rounded-[6px] p-4 border border-border">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">{topMeta?.icon ?? ""}</span>
                      <div>
                        <Link
                          href={`/benchmarks/${top.category}`}
                          className="text-[18px] font-semibold text-primary hover:text-accent transition-colors"
                        >
                          {topMeta?.label ?? top.category}
                        </Link>
                        <p className="text-[13px] text-muted">{top.totalInCategory.toLocaleString()} total mentions</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {sorted.map((cat) => {
                        const meta = CATEGORY_META[cat.category];
                        const width = maxMentions > 0 ? (cat.totalInCategory / maxMentions) * 100 : 0;
                        return (
                          <div key={cat.category} className="flex items-center gap-3">
                            <span className="w-24 text-[13px] text-secondary truncate">
                              {meta?.icon ?? ""} {meta?.label ?? cat.category}
                            </span>
                            <div className="flex-1 bg-raised rounded-[6px] h-3">
                              <div
                                className="bg-accent/70 h-3 rounded-[6px] transition-all"
                                style={{ width: `${Math.max(2, width)}%` }}
                              />
                            </div>
                            <span className="text-[13px] text-secondary w-8 text-right font-data">{cat.totalInCategory.toLocaleString()}</span>
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
              <h2 className="section-header mb-3">Category Breakdown</h2>
              <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="th-label text-left px-4 py-3">Category</th>
                      <th className="th-label text-right px-4 py-3">Recommended</th>
                      <th className="th-label text-right px-4 py-3">Compared</th>
                      <th className="th-label text-right px-4 py-3">Rejected</th>
                      <th className="th-label text-right px-4 py-3">Total</th>
                      <th className="th-label text-right px-4 py-3">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorecard.categoryBreakdown.map((cat) => {
                      const catMeta = CATEGORY_META[cat.category];
                      const wr = cat.totalInCategory > 0 ? cat.recommendations / cat.totalInCategory : 0;
                      return (
                        <tr key={cat.category} className="border-b border-border-subtle hover:bg-raised h-12">
                          <td className="px-4">
                            <Link href={`/benchmarks/${cat.category}`} className="hover:text-accent transition-colors">
                              {catMeta ? `${catMeta.icon} ${catMeta.label}` : cat.category}
                            </Link>
                          </td>
                          <td className="px-4 text-right text-accent font-data font-medium">
                            {cat.recommendations > 0 ? cat.recommendations.toLocaleString() : <span className="text-muted">-</span>}
                          </td>
                          <td className="px-4 text-right text-data-3 font-data">
                            {cat.comparisons > 0 ? cat.comparisons.toLocaleString() : <span className="text-muted">-</span>}
                          </td>
                          <td className="px-4 text-right text-data-4 font-data">
                            {cat.rejections > 0 ? cat.rejections.toLocaleString() : <span className="text-muted">-</span>}
                          </td>
                          <td className="px-4 text-right text-secondary font-data">{cat.totalInCategory.toLocaleString()}</td>
                          <td className="px-4 text-right">
                            <span className={`font-data font-medium ${
                              wr > 0.6 ? "text-signal-strong" : wr > 0.3 ? "text-data-3" : "text-data-4"
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
              <h2 className="section-header mb-3">Platform Split by Category</h2>
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
                    <div key={cat.category} className="bg-surface rounded-[6px] p-4 border border-border">
                      <h3 className="text-[13px] font-medium text-primary mb-2">
                        {catMeta ? `${catMeta.icon} ${catMeta.label}` : cat.category}
                      </h3>
                      <div className="flex gap-2">
                        {Object.entries(platformCounts).map(([platform, count]) => (
                          <span
                            key={platform}
                            className={`text-[12px] px-2 py-1 rounded-[6px] ${
                              platform === "claude_code" ? "bg-data-1/15 text-data-1" :
                              platform === "codex_cli" ? "bg-data-2/15 text-data-2" :
                              "bg-data-3/15 text-data-3"
                            }`}
                          >
                            {platform}: <span className="font-data">{count.toLocaleString()}</span>
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
