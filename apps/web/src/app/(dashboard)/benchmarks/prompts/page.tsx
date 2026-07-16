import Link from "next/link";
import { getPromptPageData } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { loadCategoryMeta } from "../categories";
import { PROMPT_SUMMARIES } from "../prompt-summaries";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function PromptIntelligencePage() {
  const [{ leaderboard: prompts, constraintDemand }, CATEGORY_META] = await Promise.all([
    getPromptPageData(),
    loadCategoryMeta(),
  ]);

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
        <h1 className="text-2xl font-bold text-primary">Prompt Intelligence</h1>
        <p className="text-secondary mt-1">
          Analysis of benchmark prompts: competitiveness, vendor dominance, constraint demand, and implementation rates
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-surface rounded-[6px] p-4 border border-border">
          <p className="stat-label">Total Prompts</p>
          <p className="stat-hero mt-1">{prompts.length.toLocaleString()}</p>
        </div>
        <div className="bg-surface rounded-[6px] p-4 border border-border">
          <p className="stat-label">Total Responses</p>
          <p className="stat-hero mt-1">{totalResponses.toLocaleString()}</p>
        </div>
        <div className="bg-surface rounded-[6px] p-4 border border-border">
          <p className="stat-label">Contested</p>
          <p className="stat-hero mt-1 !text-data-3">{contested.length.toLocaleString()}</p>
          <p className="stat-context mt-0.5">No vendor &gt;50%</p>
        </div>
        <div className="bg-surface rounded-[6px] p-4 border border-border">
          <p className="stat-label">Dominated</p>
          <p className="stat-hero mt-1 !text-data-4">{dominated.length.toLocaleString()}</p>
          <p className="stat-context mt-0.5">One vendor = 100%</p>
        </div>
        <div className="bg-surface rounded-[6px] p-4 border border-border">
          <p className="stat-label">Avg Implementation</p>
          <p className="stat-hero mt-1">{pct(avgImplRate)}</p>
        </div>
      </div>

      {/* Most Contested */}
      {contested.length > 0 && (
        <div>
          <h2 className="section-header mb-1">
            Most Contested Prompts
          </h2>
          <p className="text-[13px] text-muted mb-3">
            No single vendor wins more than 50% — highest competitive intensity
          </p>
          <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="th-label text-left px-4 py-3">Prompt</th>
                  <th className="th-label text-left px-4 py-3">Category</th>
                  <th className="th-label text-right px-4 py-3">Responses</th>
                  <th className="th-label text-right px-4 py-3">Vendors</th>
                  <th className="th-label text-left px-4 py-3">Top Vendor</th>
                  <th className="th-label text-right px-4 py-3">Top %</th>
                </tr>
              </thead>
              <tbody>
                {contested.map((p) => {
                  const prompt = PROMPT_SUMMARIES[p.prompt_id];
                  const catMeta = CATEGORY_META[p.category];
                  const topPct = p.response_count > 0 ? p.top_vendor_count / p.response_count : 0;
                  return (
                    <tr key={p.prompt_id} className="border-b border-border-subtle hover:bg-raised h-12">
                      <td className="px-4">
                        <Link href={`/benchmarks/${p.category}`} className="text-primary hover:text-accent">
                          {prompt?.title || p.prompt_id}
                        </Link>
                      </td>
                      <td className="px-4 text-secondary text-[12px]">
                        {catMeta ? `${catMeta.icon} ${catMeta.label}` : p.category}
                      </td>
                      <td className="px-4 text-right font-data">{p.response_count.toLocaleString()}</td>
                      <td className="px-4 text-right text-data-3 font-data">{p.unique_vendors.toLocaleString()}</td>
                      <td className="px-4">
                        {p.top_vendor ? (
                          <Link
                            href={`/benchmarks/vendors/${encodeURIComponent(p.top_vendor)}`}
                            className="text-accent hover:text-accent/80"
                          >
                            {vendorDisplayName(p.top_vendor)}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 text-right text-data-3 font-data">{pct(topPct)}</td>
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
          <h2 className="section-header mb-1">
            Single-Vendor Dominated
          </h2>
          <p className="text-[13px] text-muted mb-3">
            One vendor wins 100% of responses — monopoly scenarios
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dominated.map((p) => {
              const prompt = PROMPT_SUMMARIES[p.prompt_id];
              const catMeta = CATEGORY_META[p.category];
              return (
                <div key={p.prompt_id} className="bg-surface rounded-[6px] p-4 border border-border border-l-4 border-l-data-4">
                  <Link href={`/benchmarks/${p.category}`} className="text-[13px] font-medium text-primary hover:text-accent">
                    {prompt?.title || p.prompt_id}
                  </Link>
                  {catMeta && (
                    <p className="text-[12px] text-muted mt-1">{catMeta.icon} {catMeta.label}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    {p.top_vendor && (
                      <Link
                        href={`/benchmarks/vendors/${encodeURIComponent(p.top_vendor)}`}
                        className="text-[13px] text-accent hover:text-accent/80 font-medium"
                      >
                        {vendorDisplayName(p.top_vendor)}
                      </Link>
                    )}
                    <span className="text-[12px] text-muted">{p.response_count.toLocaleString()} response{p.response_count !== 1 ? "s" : ""}</span>
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
          <h2 className="section-header mb-1">
            Constraint Demand
          </h2>
          <p className="text-[13px] text-muted mb-3">
            Which technical constraints appear most frequently in prompts, and how often AI addresses them
          </p>
          <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="th-label text-left px-4 py-3">Constraint</th>
                  <th className="th-label text-right px-4 py-3">Prompts</th>
                  <th className="th-label text-right px-4 py-3">Responses</th>
                  <th className="th-label text-right px-4 py-3">Coverage</th>
                  <th className="th-label text-left px-4 py-3">Top Vendor</th>
                  <th className="th-label px-4 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {constraintDemand.map((c) => (
                  <tr key={c.constraint} className="border-b border-border-subtle hover:bg-raised h-12">
                    <td className="px-4 font-medium text-primary">
                      {c.constraint.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 text-right font-data">{c.prompt_count.toLocaleString()}</td>
                    <td className="px-4 text-right text-secondary font-data">{c.response_count.toLocaleString()}</td>
                    <td className="px-4 text-right">
                      <span className={`font-data ${
                        c.coverage_rate > 0.7 ? "text-signal-strong" :
                        c.coverage_rate > 0.4 ? "text-data-3" :
                        "text-data-4"
                      }`}>
                        {pct(c.coverage_rate)}
                      </span>
                    </td>
                    <td className="px-4">
                      {c.top_vendor ? (
                        <Link
                          href={`/benchmarks/vendors/${encodeURIComponent(c.top_vendor)}`}
                          className="text-accent hover:text-accent/80 text-[12px]"
                        >
                          {vendorDisplayName(c.top_vendor)} ({c.top_vendor_count.toLocaleString()})
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4">
                      <div className="w-full bg-raised rounded-[6px] h-1.5">
                        <div
                          className={`h-1.5 rounded-[6px] ${
                            c.coverage_rate > 0.7 ? "bg-signal-strong" :
                            c.coverage_rate > 0.4 ? "bg-data-3" :
                            "bg-data-4"
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
          <h2 className="section-header mb-1">
            All Benchmark Prompts
          </h2>
          <p className="text-[13px] text-muted mb-3">
            Complete prompt leaderboard sorted by response count
          </p>
          <div className="bg-surface rounded-[6px] overflow-hidden overflow-x-auto border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="th-label text-left px-4 py-3 whitespace-nowrap">Prompt</th>
                  <th className="th-label text-left px-4 py-3 whitespace-nowrap">Category</th>
                  <th className="th-label text-right px-4 py-3 whitespace-nowrap">Responses</th>
                  <th className="th-label text-left px-4 py-3 whitespace-nowrap">Top Vendor</th>
                  <th className="th-label text-right px-4 py-3 whitespace-nowrap">Impl %</th>
                  <th className="th-label text-right px-4 py-3 whitespace-nowrap">Constraints</th>
                  <th className="th-label text-right px-4 py-3 whitespace-nowrap">Coverage</th>
                  <th className="th-label text-center px-4 py-3 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {prompts.map((p) => {
                  const prompt = PROMPT_SUMMARIES[p.prompt_id];
                  const catMeta = CATEGORY_META[p.category];
                  return (
                    <tr key={p.prompt_id} className="border-b border-border-subtle hover:bg-raised h-12">
                      <td className="px-4">
                        <Link href={`/benchmarks/${p.category}`} className="text-primary hover:text-accent">
                          {prompt?.title || p.prompt_id}
                        </Link>
                      </td>
                      <td className="px-4 text-[12px] text-secondary whitespace-nowrap">
                        {catMeta ? `${catMeta.icon} ${catMeta.label}` : p.category}
                      </td>
                      <td className="px-4 text-right font-data">{p.response_count.toLocaleString()}</td>
                      <td className="px-4">
                        {p.top_vendor ? (
                          <Link
                            href={`/benchmarks/vendors/${encodeURIComponent(p.top_vendor)}`}
                            className="text-accent hover:text-accent/80 text-[12px]"
                          >
                            {vendorDisplayName(p.top_vendor)} ({p.top_vendor_count.toLocaleString()})
                          </Link>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 text-right">
                        <span className={`font-data ${
                          p.implementation_rate > 0.6 ? "text-signal-strong" :
                          p.implementation_rate > 0.3 ? "text-data-3" :
                          "text-data-4"
                        }`}>
                          {pct(p.implementation_rate)}
                        </span>
                      </td>
                      <td className="px-4 text-right text-secondary font-data">{p.total_constraints.toLocaleString()}</td>
                      <td className="px-4 text-right">
                        <span className={`font-data ${
                          p.avg_constraints_covered > 0.7 ? "text-signal-strong" :
                          p.avg_constraints_covered > 0.4 ? "text-data-3" :
                          "text-data-4"
                        }`}>
                          {pct(p.avg_constraints_covered)}
                        </span>
                      </td>
                      <td className="px-4 text-center">
                        {p.is_contested ? (
                          <span className="text-[12px] px-1.5 py-0.5 rounded-[6px] bg-data-3/15 text-data-3">Contested</span>
                        ) : p.is_dominated ? (
                          <span className="text-[12px] px-1.5 py-0.5 rounded-[6px] bg-data-4/15 text-data-4">Monopoly</span>
                        ) : (
                          <span className="text-[12px] px-1.5 py-0.5 rounded-[6px] bg-raised text-secondary">Normal</span>
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
        <div className="quiet-signal">
          <p className="text-[18px] text-secondary">No prompt data yet</p>
          <p className="text-[13px] mt-2 text-muted">
            Run benchmark sessions to generate prompt intelligence data
          </p>
        </div>
      )}
    </div>
  );
}
