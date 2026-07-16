import type { BuildVsBuyCategoryRow } from "@/lib/db";
import { PlatformBadge } from "./PlatformBadge";

const PLATFORM_ORDER = ["claude_code", "codex_cli", "cursor"];

function categoryDisplayName(id: string): string {
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ppDelta(val: number): string {
  const sign = val > 0 ? "+" : "";
  return `${sign}${Math.round(val)}pp`;
}

function barWidth(rate: number): string {
  return `${Math.max(2, Math.min(100, rate))}%`;
}

export function BuildVsBuyTable({
  categories,
  overall,
}: {
  categories: BuildVsBuyCategoryRow[];
  overall: Record<string, { total: number; diyCount: number; diyRate: number }>;
}) {
  // Determine which platforms actually have data
  const activePlatforms = PLATFORM_ORDER.filter(
    (p) => overall[p] && overall[p].total > 0,
  );

  if (activePlatforms.length === 0 && categories.length === 0) {
    return (
      <div className="quiet-signal">
        <p className="text-secondary text-[14px]">
          No Build vs Buy data available yet.
        </p>
        <p className="text-muted text-[13px] italic mt-2">
          Run benchmarks across multiple platforms to see Custom/DIY rates.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h3 className="section-header">Build vs Buy</h3>
        <p className="text-secondary text-[13px] mt-1">
          Custom/DIY rate by category, sorted by absolute delta. Shows how often
          each agent builds from scratch instead of recommending a vendor.
        </p>
      </div>

      {/* Overall hero stats */}
      {activePlatforms.length > 0 && (
        <div className="flex gap-6">
          {activePlatforms.map((platform) => {
            const data = overall[platform];
            if (!data) return null;
            return (
              <div key={platform} className="text-center">
                <p className="stat-hero">{Math.round(data.diyRate)}%</p>
                <p className="text-muted text-[12px] mt-1">
                  <PlatformBadge platform={platform} size="xs" /> overall DIY
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Category table */}
      {categories.length > 0 && (
        <div className="bg-surface rounded-[6px] border border-border overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="th-label text-left py-2 px-3 h-12 min-w-[180px]">
                  Category
                </th>
                {activePlatforms.map((p) => (
                  <th key={p} className="th-label text-left py-2 px-3 h-12 min-w-[200px]">
                    <PlatformBadge platform={p} size="xs" /> Custom/DIY
                  </th>
                ))}
                <th className="th-label text-right py-2 px-3 h-12 w-[80px]">
                  Delta
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((row) => (
                <tr
                  key={row.category}
                  className="border-b border-border-subtle hover:bg-raised/50 transition-colors"
                >
                  <td className="py-3 px-3 text-primary font-medium">
                    {categoryDisplayName(row.category)}
                  </td>
                  {activePlatforms.map((p) => {
                    const data = row.platforms[p];
                    const rate = data?.diyRate ?? 0;
                    return (
                      <td key={p} className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-[6px] bg-border-subtle rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                p === "claude_code"
                                  ? "bg-data-1"
                                  : p === "codex_cli"
                                    ? "bg-data-2"
                                    : "bg-data-3"
                              }`}
                              style={{ width: barWidth(rate) }}
                            />
                          </div>
                          <span className="font-data text-secondary w-[36px] text-right">
                            {Math.round(rate)}%
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-3 px-3 text-right">
                    <span
                      className={`font-data ${
                        Math.abs(row.delta) >= 15
                          ? "text-data-4"
                          : Math.abs(row.delta) >= 5
                            ? "text-data-3"
                            : "text-muted"
                      }`}
                    >
                      {ppDelta(row.delta)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footnote */}
      <p className="text-muted text-[11px] italic">
        Positive delta means one platform builds custom more often. Categories
        with insufficient data on either side are excluded.
      </p>
    </section>
  );
}
