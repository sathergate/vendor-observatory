import {
  getDivergenceMatrix,
  getConstraintInfluence,
  getTemporalDrift,
} from "@/lib/db";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function InsightsPage() {
  const rawDivergences = await getDivergenceMatrix();
  const constraintInfluence = await getConstraintInfluence();
  const drift = await getTemporalDrift();

  // Sort by divergence score descending (most disagreement first)
  const divergences = [...rawDivergences].sort((a, b) => b.divergenceScore - a.divergenceScore);

  const divergentCount = divergences.filter((d) => d.isDivergent).length;
  const totalDivergences = divergences.length;
  const hasData = divergences.length > 0 || constraintInfluence.length > 0 || drift.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="section-header">Cross-Session Insights</h2>
        <p className="text-secondary text-[13px] mt-1">
          Platform divergence, constraint influence, and temporal drift analysis
        </p>
      </div>

      {!hasData && (
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">No organic signal detected in this period.</p>
          <p className="text-muted text-[13px] italic mt-2">
            Run <code className="bg-raised px-2 py-0.5 rounded-[6px] text-[12px] font-mono text-accent">obs analyze --type all</code> to generate cross-session analysis.
          </p>
        </div>
      )}

      {/* Summary Stats */}
      {hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface rounded-[6px] p-6 border border-border">
            <p className="stat-label">Prompts Analyzed</p>
            <p className="stat-hero mt-1">{totalDivergences.toLocaleString()}</p>
          </div>
          <div className="bg-surface rounded-[6px] p-6 border border-border">
            <p className="stat-label">Platform Divergent</p>
            <p className="stat-hero mt-1 text-data-4">{divergentCount.toLocaleString()}</p>
          </div>
          <div className="bg-surface rounded-[6px] p-6 border border-border">
            <p className="stat-label">Constraints Analyzed</p>
            <p className="stat-hero mt-1">{constraintInfluence.length.toLocaleString()}</p>
          </div>
          <div className="bg-surface rounded-[6px] p-6 border border-border">
            <p className="stat-label">Drifting Vendors</p>
            <p className="stat-hero mt-1 text-data-3">{drift.length.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Section 1: Divergence Matrix */}
      {divergences.length > 0 && (
        <section className="space-y-4">
          <h3 className="section-header">Platform Divergence Matrix</h3>
          <p className="text-[13px] text-secondary">
            Prompts where different platforms detect different vendors.
            Higher divergence score = more disagreement.
          </p>
          <div className="bg-surface rounded-[6px] border border-border overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="th-label text-left py-2 px-3 h-12">Prompt</th>
                  {getAllPlatforms(divergences).map((p) => (
                    <th key={p} className="th-label text-left py-2 px-3 h-12">
                      {p}
                    </th>
                  ))}
                  <th className="th-label text-left py-2 px-3 h-12">Score</th>
                </tr>
              </thead>
              <tbody>
                {divergences
                  .sort((a, b) => b.divergenceScore - a.divergenceScore)
                  .slice(0, 30)
                  .map((d) => {
                    const platforms = getAllPlatforms(divergences);
                    return (
                      <tr
                        key={d.promptId}
                        className={`border-b border-border-subtle hover:bg-raised h-12 ${d.isDivergent ? "bg-data-4/5" : ""}`}
                      >
                        <td className="py-2 px-3 text-secondary font-mono text-[12px]">
                          {d.promptId}
                        </td>
                        {platforms.map((platform) => {
                          const vendor = d.platforms[platform];
                          return (
                            <td key={platform} className="py-2 px-3">
                              {vendor ? (
                                <span className="text-data-1 text-[12px]">{vendor}</span>
                              ) : (
                                <span className="text-muted text-[12px]">{"\u2014"}</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 px-3">
                          <span
                            className={`font-data text-[12px] ${
                              d.divergenceScore > 0.5
                                ? "text-data-4"
                                : d.divergenceScore > 0
                                  ? "text-data-3"
                                  : "text-data-5"
                            }`}
                          >
                            {d.divergenceScore.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Section 2: Constraint Influence */}
      {constraintInfluence.length > 0 && (
        <section className="space-y-4">
          <h3 className="section-header">Constraint Influence Ranking</h3>
          <p className="text-[13px] text-secondary">
            Constraints ranked by how much they shift vendor preference.
            Higher influence = stronger effect on which vendor is selected.
          </p>
          <div className="space-y-3">
            {constraintInfluence.slice(0, 15).map((ci) => (
              <div key={ci.constraint} className="bg-surface rounded-[6px] p-6 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[13px] text-accent">{ci.constraint}</span>
                  <span className="text-[12px] text-secondary">
                    Influence: <span className="font-data">{ci.influenceScore.toFixed(2)}</span>
                  </span>
                </div>
                <div className="flex-1 bg-raised rounded-[6px] h-2 mb-3">
                  <div
                    className="bg-accent h-full rounded-[6px] transition-all"
                    style={{ width: `${Math.min(100, ci.influenceScore * 100)}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ci.vendorShifts.slice(0, 4).map((vs) => (
                    <div key={vs.vendor} className="text-[12px]">
                      <span className="text-secondary">{vs.vendor}</span>
                      <span
                        className={`ml-1 font-data ${
                          vs.delta > 0 ? "text-data-5" : vs.delta < 0 ? "text-data-4" : "text-muted"
                        }`}
                      >
                        {vs.delta > 0 ? "+" : ""}{pct(vs.delta)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 3: Temporal Drift */}
      {drift.length > 0 && (
        <section className="space-y-4">
          <h3 className="section-header">Temporal Drift</h3>
          <p className="text-[13px] text-secondary">
            Vendors with significant detection rate changes over time (&gt;15% shift).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {drift.map((d) => (
              <div
                key={d.vendor}
                className="bg-surface rounded-[6px] p-6 border border-border"
              >
                <p className="text-primary font-medium text-[14px]">{d.vendor}</p>
                <div className="flex items-center gap-3 mt-3">
                  <div className="text-center">
                    <p className="text-[11px] text-muted uppercase">Early</p>
                    <p className="font-data text-[14px] text-secondary">{pct(d.earlyWinRate)}</p>
                  </div>
                  <span className="text-muted">{"\u2192"}</span>
                  <div className="text-center">
                    <p className="text-[11px] text-muted uppercase">Late</p>
                    <p className="font-data text-[14px] text-secondary">{pct(d.lateWinRate)}</p>
                  </div>
                  <div className="text-center ml-auto">
                    <p className="text-[11px] text-muted uppercase">Delta</p>
                    <p
                      className={`font-data text-[14px] font-medium ${
                        d.delta > 0 ? "text-data-5" : "text-data-4"
                      }`}
                    >
                      {d.delta > 0 ? "+" : ""}{pct(d.delta)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function getAllPlatforms(divergences: Array<{ platforms: Record<string, string | null> }>): string[] {
  const set = new Set<string>();
  for (const d of divergences) {
    for (const p of Object.keys(d.platforms)) set.add(p);
  }
  return Array.from(set).sort();
}
