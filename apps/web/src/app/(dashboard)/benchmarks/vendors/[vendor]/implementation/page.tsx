import { getVendorScorecard } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SectionNav } from "@/components/SectionNav";
import { VendorGuard } from "@/components/VendorGuard";
import { loadCategoryMeta } from "../../../categories";
import { PROMPT_SUMMARIES } from "../../../prompt-summaries";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
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
        <h1 className="text-2xl font-bold">Implementation Rate</h1>

        {!scorecard ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
            <p>No data available yet.</p>
          </div>
        ) : (
          <>
            <SectionNav sections={[
              { id: "kpis", label: "KPIs" },
              { id: "category-breakdown", label: "By Category" },
              { id: "platform-split", label: "By Platform" },
              { id: "context", label: "Context" },
            ]} />

            {/* KPIs */}
            <div id="kpis">
              <h2 className="text-lg font-semibold mb-3">Key Metrics</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Implementation Rate</p>
                  <p className={`text-2xl font-bold mt-1 ${
                    scorecard.implementationRate > 0.6 ? "text-green-400" :
                    scorecard.implementationRate > 0.3 ? "text-yellow-400" : "text-red-400"
                  }`}>
                    {pct(scorecard.implementationRate)}
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Total Recommended</p>
                  <p className="text-2xl font-bold mt-1 text-blue-400">{scorecard.totalRecommendations}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Installed / Configured</p>
                  <p className="text-2xl font-bold mt-1 text-green-400">
                    {scorecard.implementationContext.filter(c => c.isImplemented).length}
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Not Implemented</p>
                  <p className="text-2xl font-bold mt-1 text-gray-400">
                    {scorecard.implementationContext.filter(c => !c.isImplemented).length}
                  </p>
                </div>
              </div>
            </div>

            {/* Category Breakdown */}
            {scorecard.categoryBreakdown.length > 0 && (
              <div id="category-breakdown">
                <h2 className="text-lg font-semibold mb-3">Implementation by Category</h2>
                <div className="bg-gray-800 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-400">
                        <th className="text-left px-4 py-3">Category</th>
                        <th className="text-right px-4 py-3">Recommended</th>
                        <th className="text-right px-4 py-3">Implemented</th>
                        <th className="text-right px-4 py-3">Impl. Rate</th>
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
                          <tr key={cat.category} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                            <td className="px-4 py-2">
                              {catMeta ? `${catMeta.icon} ${catMeta.label}` : cat.category}
                            </td>
                            <td className="px-4 py-2 text-right text-blue-400">{recInCat}</td>
                            <td className="px-4 py-2 text-right text-green-400">{implInCat}</td>
                            <td className="px-4 py-2 text-right">
                              <span className={`font-medium ${
                                rate > 0.6 ? "text-green-400" : rate > 0.3 ? "text-yellow-400" : "text-red-400"
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
              </div>
            )}

            {/* Platform Split */}
            {Object.keys(scorecard.platformSplit).length > 0 && (
              <div id="platform-split">
                <h2 className="text-lg font-semibold mb-3">Implementation by Platform</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(scorecard.platformSplit).map(([platform, count]) => {
                    const platformImpl = scorecard.implementationContext.filter(
                      c => c.platform === platform
                    );
                    const implCount = platformImpl.filter(c => c.isImplemented).length;
                    const rate = platformImpl.length > 0 ? implCount / platformImpl.length : 0;
                    return (
                      <div key={platform} className="bg-gray-800 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-medium ${
                            platform === "claude_code" ? "text-blue-300" :
                            platform === "codex_cli" ? "text-green-300" : "text-purple-300"
                          }`}>
                            {platform}
                          </span>
                          <span className="text-sm text-gray-400">{count} recommendations</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-xl font-bold ${
                            rate > 0.6 ? "text-green-400" : rate > 0.3 ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {pct(rate)}
                          </span>
                          <span className="text-sm text-gray-500">implementation rate</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {implCount} of {platformImpl.length} implemented
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Implementation Context */}
            <div id="context">
              <h2 className="text-lg font-semibold mb-3">Implementation Context</h2>
              {scorecard.implementationContext.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-400 text-sm">
                  No implementation context available.
                </div>
              ) : (
                <div className="bg-gray-800 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-400">
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3">Prompt</th>
                        <th className="text-left px-4 py-3">Category</th>
                        <th className="text-left px-4 py-3">Platform</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scorecard.implementationContext.map((ctx, i) => {
                        const prompt = PROMPT_SUMMARIES[ctx.prompt_id];
                        const catMeta = CATEGORY_META[ctx.category];
                        return (
                          <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                            <td className="px-4 py-2">
                              {ctx.isImplemented ? (
                                <span className="text-green-400 font-medium">Implemented</span>
                              ) : (
                                <span className="text-gray-500">Not implemented</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-gray-300">
                              {prompt?.title || ctx.prompt_id}
                            </td>
                            <td className="px-4 py-2 text-gray-400">
                              {catMeta ? `${catMeta.icon} ${catMeta.label}` : ctx.category}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                ctx.platform === "claude_code" ? "bg-blue-900/50 text-blue-300" :
                                ctx.platform === "codex_cli" ? "bg-green-900/50 text-green-300" :
                                "bg-purple-900/50 text-purple-300"
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
            </div>
          </>
        )}
      </VendorGuard>
    </div>
  );
}
