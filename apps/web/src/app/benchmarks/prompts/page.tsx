import Link from "next/link";
import { getPromptPageData } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CATEGORY_META } from "../categories";
import { PROMPT_SUMMARIES } from "../prompt-summaries";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default async function PromptIntelligencePage() {
  const { leaderboard: prompts, constraintDemand } = await getPromptPageData();

  const contested = prompts.filter((p) => p.is_contested);
  const dominated = prompts.filter((p) => p.is_dominated);
  const totalResponses = prompts.reduce((s, p) => s + p.response_count, 0);
  const avgImplRate = prompts.length > 0
    ? prompts.reduce((s, p) => s + p.implementation_rate, 0) / prompts.length
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Prompt Intelligence" }]} />
        <h1 className="text-2xl font-bold">Prompt Intelligence</h1>
        <p className="text-gray-400 mt-1">
          Analysis of benchmark prompts: competitiveness, vendor dominance, constraint demand, and implementation rates
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Total Prompts</p>
          <p className="text-2xl font-bold mt-1">{prompts.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Total Responses</p>
          <p className="text-2xl font-bold mt-1">{totalResponses}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Contested</p>
          <p className="text-2xl font-bold mt-1 text-yellow-400">{contested.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">No vendor &gt;50%</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Dominated</p>
          <p className="text-2xl font-bold mt-1 text-red-400">{dominated.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">One vendor = 100%</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Avg Implementation</p>
          <p className="text-2xl font-bold mt-1">{pct(avgImplRate)}</p>
        </div>
      </div>

      {/* Most Contested */}
      {contested.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-1">
            Most Contested Prompts
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            No single vendor wins more than 50% — highest competitive intensity
          </p>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-4 py-3">Prompt</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-right px-4 py-3">Responses</th>
                  <th className="text-right px-4 py-3">Vendors</th>
                  <th className="text-left px-4 py-3">Top Vendor</th>
                  <th className="text-right px-4 py-3">Top %</th>
                </tr>
              </thead>
              <tbody>
                {contested.map((p) => {
                  const prompt = PROMPT_SUMMARIES[p.prompt_id];
                  const catMeta = CATEGORY_META[p.category];
                  const topPct = p.response_count > 0 ? p.top_vendor_count / p.response_count : 0;
                  return (
                    <tr key={p.prompt_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="px-4 py-2">
                        <Link href={`/benchmarks/${p.category}`} className="text-gray-200 hover:text-blue-400">
                          {prompt?.title || p.prompt_id}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">
                        {catMeta ? `${catMeta.icon} ${catMeta.label}` : p.category}
                      </td>
                      <td className="px-4 py-2 text-right">{p.response_count}</td>
                      <td className="px-4 py-2 text-right text-yellow-400">{p.unique_vendors}</td>
                      <td className="px-4 py-2">
                        {p.top_vendor ? (
                          <Link
                            href={`/benchmarks/vendors/${encodeURIComponent(p.top_vendor)}`}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            {vendorDisplayName(p.top_vendor)}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-yellow-400">{pct(topPct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* One-Vendor Dominated */}
      {dominated.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-1">
            Single-Vendor Dominated
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            One vendor wins 100% of responses — monopoly scenarios
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dominated.map((p) => {
              const prompt = PROMPT_SUMMARIES[p.prompt_id];
              const catMeta = CATEGORY_META[p.category];
              return (
                <div key={p.prompt_id} className="bg-gray-800 rounded-lg p-4 border-l-4 border-red-500">
                  <Link href={`/benchmarks/${p.category}`} className="text-sm font-medium text-gray-200 hover:text-blue-400">
                    {prompt?.title || p.prompt_id}
                  </Link>
                  {catMeta && (
                    <p className="text-xs text-gray-500 mt-1">{catMeta.icon} {catMeta.label}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    {p.top_vendor && (
                      <Link
                        href={`/benchmarks/vendors/${encodeURIComponent(p.top_vendor)}`}
                        className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                      >
                        {vendorDisplayName(p.top_vendor)}
                      </Link>
                    )}
                    <span className="text-xs text-gray-500">{p.response_count} response{p.response_count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Constraint Demand */}
      {constraintDemand.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-1">
            Constraint Demand
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Which technical constraints appear most frequently in prompts, and how often AI addresses them
          </p>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-4 py-3">Constraint</th>
                  <th className="text-right px-4 py-3">Prompts</th>
                  <th className="text-right px-4 py-3">Responses</th>
                  <th className="text-right px-4 py-3">Coverage</th>
                  <th className="text-left px-4 py-3">Top Vendor</th>
                  <th className="px-4 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {constraintDemand.map((c) => (
                  <tr key={c.constraint} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-2 font-medium text-gray-200">
                      {c.constraint.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-2 text-right">{c.prompt_count}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{c.response_count}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={
                        c.coverage_rate > 0.7 ? "text-green-400" :
                        c.coverage_rate > 0.4 ? "text-yellow-400" :
                        "text-red-400"
                      }>
                        {pct(c.coverage_rate)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {c.top_vendor ? (
                        <Link
                          href={`/benchmarks/vendors/${encodeURIComponent(c.top_vendor)}`}
                          className="text-blue-400 hover:text-blue-300 text-xs"
                        >
                          {vendorDisplayName(c.top_vendor)} ({c.top_vendor_count})
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            c.coverage_rate > 0.7 ? "bg-green-500" :
                            c.coverage_rate > 0.4 ? "bg-yellow-500" :
                            "bg-red-500"
                          }`}
                          style={{ width: `${Math.max(4, Math.round(c.coverage_rate * 100))}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Prompts Table */}
      {prompts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-1">
            All Benchmark Prompts
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Complete prompt leaderboard sorted by response count
          </p>
          <div className="bg-gray-800 rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-4 py-3 whitespace-nowrap">Prompt</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Category</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Responses</th>
                  <th className="text-left px-4 py-3 whitespace-nowrap">Top Vendor</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Impl %</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Constraints</th>
                  <th className="text-right px-4 py-3 whitespace-nowrap">Coverage</th>
                  <th className="text-center px-4 py-3 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {prompts.map((p) => {
                  const prompt = PROMPT_SUMMARIES[p.prompt_id];
                  const catMeta = CATEGORY_META[p.category];
                  return (
                    <tr key={p.prompt_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="px-4 py-2">
                        <Link href={`/benchmarks/${p.category}`} className="text-gray-200 hover:text-blue-400">
                          {prompt?.title || p.prompt_id}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">
                        {catMeta ? `${catMeta.icon} ${catMeta.label}` : p.category}
                      </td>
                      <td className="px-4 py-2 text-right">{p.response_count}</td>
                      <td className="px-4 py-2">
                        {p.top_vendor ? (
                          <Link
                            href={`/benchmarks/vendors/${encodeURIComponent(p.top_vendor)}`}
                            className="text-blue-400 hover:text-blue-300 text-xs"
                          >
                            {vendorDisplayName(p.top_vendor)} ({p.top_vendor_count})
                          </Link>
                        ) : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={
                          p.implementation_rate > 0.6 ? "text-green-400" :
                          p.implementation_rate > 0.3 ? "text-yellow-400" :
                          "text-red-400"
                        }>
                          {pct(p.implementation_rate)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-400">{p.total_constraints}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={
                          p.avg_constraints_covered > 0.7 ? "text-green-400" :
                          p.avg_constraints_covered > 0.4 ? "text-yellow-400" :
                          "text-red-400"
                        }>
                          {pct(p.avg_constraints_covered)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {p.is_contested ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-300">Contested</span>
                        ) : p.is_dominated ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-300">Monopoly</span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">Normal</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {prompts.length === 0 && (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
          <p className="text-lg">No prompt data yet</p>
          <p className="text-sm mt-2">
            Run benchmark sessions to generate prompt intelligence data
          </p>
        </div>
      )}
    </div>
  );
}
