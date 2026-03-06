import { getVendorScorecard } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { TabbedView, TabPanel } from "@/components/TabbedView";
import { VendorGuard } from "@/components/VendorGuard";
import { loadCategoryMeta } from "../../../categories";
import { PROMPT_SUMMARIES } from "../../../prompt-summaries";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function ImplementationPage({ params }: { params: Promise<{ vendor: string }> }) {
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
        { label: "Implementation Rate" },
      ]} />

      <VendorGuard vendorId={vendorId}>
        <h1 className="text-2xl font-bold text-primary">Implementation Rate</h1>

        {!scorecard ? (
          <div className="quiet-signal">
            <p className="text-secondary">No data available yet.</p>
          </div>
        ) : (
          <>
            <TabbedView sections={[
              { id: "kpis", label: "KPIs" },
              ...(scorecard.categoryBreakdown.length > 0 ? [{ id: "category-breakdown", label: "By Category" }] : []),
              ...(Object.keys(scorecard.platformSplit).length > 0 ? [{ id: "platform-split", label: "By Platform" }] : []),
              { id: "context", label: "Context" },
            ]}>

            {/* KPIs */}
            <TabPanel id="kpis"><div>
              <h2 className="section-header mb-3">Key Metrics</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-surface rounded-[6px] p-4 border border-border">
                  <p className="stat-label">Implementation Rate</p>
                  <p className={`stat-hero mt-1 ${
                    scorecard.implementationRate > 0.6 ? "!text-signal-strong" :
                    scorecard.implementationRate > 0.3 ? "!text-data-3" : "!text-data-4"
                  }`}>
                    {pct(scorecard.implementationRate)}
                  </p>
                </div>
                <div className="bg-surface rounded-[6px] p-4 border border-border">
                  <p className="stat-label">Total Recommended</p>
                  <p className="stat-hero mt-1 !text-accent">{scorecard.totalRecommendations.toLocaleString()}</p>
                </div>
                <div className="bg-surface rounded-[6px] p-4 border border-border">
                  <p className="stat-label">Installed / Configured</p>
                  <p className="stat-hero mt-1 !text-signal-strong">
                    {scorecard.implementationContext.filter(c => c.isImplemented).length.toLocaleString()}
                  </p>
                </div>
                <div className="bg-surface rounded-[6px] p-4 border border-border">
                  <p className="stat-label">Not Implemented</p>
                  <p className="stat-hero mt-1 !text-secondary">
                    {scorecard.implementationContext.filter(c => !c.isImplemented).length.toLocaleString()}
                  </p>
                </div>
              </div>
            </div></TabPanel>

            {/* Category Breakdown */}
            {scorecard.categoryBreakdown.length > 0 && (
              <TabPanel id="category-breakdown"><div>
                <h2 className="section-header mb-3">Implementation by Category</h2>
                <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="th-label text-left px-4 py-3">Category</th>
                        <th className="th-label text-right px-4 py-3">Recommended</th>
                        <th className="th-label text-right px-4 py-3">Implemented</th>
                        <th className="th-label text-right px-4 py-3">Impl. Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scorecard.categoryBreakdown.map((cat) => {
                        const catMeta = CATEGORY_META[cat.category];
                        const implInCat = scorecard.implementationContext.filter(
                          c => c.category === cat.category && c.isImplemented
                        ).length;
                        const recInCat = scorecard.implementationContext.filter(
                          c => c.category === cat.category
                        ).length;
                        const rate = recInCat > 0 ? implInCat / recInCat : 0;
                        return (
                          <tr key={cat.category} className="border-b border-border-subtle hover:bg-raised h-12">
                            <td className="px-4">
                              {catMeta ? `${catMeta.icon} ${catMeta.label}` : cat.category}
                            </td>
                            <td className="px-4 text-right text-accent font-data">{recInCat.toLocaleString()}</td>
                            <td className="px-4 text-right text-signal-strong font-data">{implInCat.toLocaleString()}</td>
                            <td className="px-4 text-right">
                              <span className={`font-data font-medium ${
                                rate > 0.6 ? "text-signal-strong" : rate > 0.3 ? "text-data-3" : "text-data-4"
                              }`}>
                                {pct(rate)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div></TabPanel>
            )}

            {/* Platform Split */}
            {Object.keys(scorecard.platformSplit).length > 0 && (
              <TabPanel id="platform-split"><div>
                <h2 className="section-header mb-3">Implementation by Platform</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(scorecard.platformSplit).map(([platform, count]) => {
                    const platformImpl = scorecard.implementationContext.filter(
                      c => c.platform === platform
                    );
                    const implCount = platformImpl.filter(c => c.isImplemented).length;
                    const rate = platformImpl.length > 0 ? implCount / platformImpl.length : 0;
                    return (
                      <div key={platform} className="bg-surface rounded-[6px] p-4 border border-border">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[13px] font-medium ${
                            platform === "claude_code" ? "text-data-1" :
                            platform === "codex_cli" ? "text-data-2" : "text-data-3"
                          }`}>
                            {platform}
                          </span>
                          <span className="text-[13px] text-secondary">{count.toLocaleString()} recommendations</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-[20px] font-bold font-data ${
                            rate > 0.6 ? "text-signal-strong" : rate > 0.3 ? "text-data-3" : "text-data-4"
                          }`}>
                            {pct(rate)}
                          </span>
                          <span className="text-[13px] text-muted">implementation rate</span>
                        </div>
                        <div className="stat-context mt-1">
                          {implCount.toLocaleString()} of {platformImpl.length.toLocaleString()} implemented
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div></TabPanel>
            )}

            {/* Implementation Context */}
            <TabPanel id="context"><div>
              <h2 className="section-header mb-3">Implementation Context</h2>
              {scorecard.implementationContext.length === 0 ? (
                <div className="quiet-signal">
                  <p className="text-secondary text-[13px]">No implementation context available.</p>
                </div>
              ) : (
                <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="th-label text-left px-4 py-3">Status</th>
                        <th className="th-label text-left px-4 py-3">Prompt</th>
                        <th className="th-label text-left px-4 py-3">Category</th>
                        <th className="th-label text-left px-4 py-3">Platform</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scorecard.implementationContext.map((ctx, i) => {
                        const prompt = PROMPT_SUMMARIES[ctx.prompt_id];
                        const catMeta = CATEGORY_META[ctx.category];
                        return (
                          <tr key={i} className="border-b border-border-subtle hover:bg-raised h-12">
                            <td className="px-4">
                              {ctx.isImplemented ? (
                                <span className="text-signal-strong font-medium">Implemented</span>
                              ) : (
                                <span className="text-muted">Not implemented</span>
                              )}
                            </td>
                            <td className="px-4 text-primary">
                              {prompt?.title || ctx.prompt_id}
                            </td>
                            <td className="px-4 text-secondary">
                              {catMeta ? `${catMeta.icon} ${catMeta.label}` : ctx.category}
                            </td>
                            <td className="px-4">
                              <span className={`text-[12px] px-2 py-0.5 rounded-[6px] ${
                                ctx.platform === "claude_code" ? "bg-data-1/15 text-data-1" :
                                ctx.platform === "codex_cli" ? "bg-data-2/15 text-data-2" :
                                "bg-data-3/15 text-data-3"
                              }`}>
                                {ctx.platform}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div></TabPanel>
          </TabbedView>
          </>
        )}
      </VendorGuard>
    </div>
  );
}
