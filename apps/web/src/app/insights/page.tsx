import {
  getDivergenceMatrix,
  getConstraintInfluence,
  getTemporalDrift,
} from "@/lib/db";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function InsightsPage() {
  const divergences = getDivergenceMatrix();
  const constraintInfluence = getConstraintInfluence();
  const drift = getTemporalDrift();

  const divergentCount = divergences.filter((d) => d.isDivergent).length;
  const totalDivergences = divergences.length;
  const hasData = divergences.length > 0 || constraintInfluence.length > 0 || drift.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Cross-Session Insights</h1>
        <p className="text-gray-400 mt-1">
          Platform divergence, constraint influence, and temporal drift analysis
        </p>
      </div>

      {!hasData && (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">
            No insight data available yet. Run{" "}
            <code className="text-blue-400 bg-gray-700 px-2 py-0.5 rounded">obs analyze --type all</code>{" "}
            to generate cross-session analysis.
          </p>
        </div>
      )}

      {/* Summary Stats */}
      {hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Prompts Analyzed</p>
            <p className="text-2xl font-bold mt-1">{totalDivergences}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Platform Divergent</p>
            <p className="text-2xl font-bold mt-1 text-red-400">{divergentCount}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Constraints Analyzed</p>
            <p className="text-2xl font-bold mt-1">{constraintInfluence.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Drifting Vendors</p>
            <p className="text-2xl font-bold mt-1 text-yellow-400">{drift.length}</p>
          </div>
        </div>
      )}

      {/* Section 1: Divergence Matrix */}
      {divergences.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Platform Divergence Matrix</h2>
          <p className="text-sm text-gray-400">
            Prompts where different platforms recommend different vendors.
            Higher divergence score = more disagreement.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Prompt</th>
                  {getAllPlatforms(divergences).map((p) => (
                    <th key={p} className="text-left py-2 px-3 text-gray-400 font-medium">
                      {p}
                    </th>
                  ))}
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Score</th>
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
                        className={`border-b border-gray-700/50 ${d.isDivergent ? "bg-red-900/10" : ""}`}
                      >
                        <td className="py-2 px-3 text-gray-300 font-mono text-xs">
                          {d.promptId}
                        </td>
                        {platforms.map((platform) => {
                          const vendor = d.platforms[platform];
                          return (
                            <td key={platform} className="py-2 px-3">
                              {vendor ? (
                                <span className="text-blue-300 text-xs">{vendor}</span>
                              ) : (
                                <span className="text-gray-600 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 px-3">
                          <span
                            className={`text-xs font-medium ${
                              d.divergenceScore > 0.5
                                ? "text-red-400"
                                : d.divergenceScore > 0
                                  ? "text-yellow-400"
                                  : "text-green-400"
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
          <h2 className="text-lg font-semibold">Constraint Influence Ranking</h2>
          <p className="text-sm text-gray-400">
            Constraints ranked by how much they shift vendor preference.
            Higher influence = stronger effect on which vendor wins.
          </p>
          <div className="space-y-3">
            {constraintInfluence.slice(0, 15).map((ci) => (
              <div key={ci.constraint} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm text-blue-400">{ci.constraint}</span>
                  <span className="text-xs text-gray-400">
                    Influence: {ci.influenceScore.toFixed(2)}
                  </span>
                </div>
                <div className="flex-1 bg-gray-700 rounded-full h-2 mb-3">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, ci.influenceScore * 100)}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ci.vendorShifts.slice(0, 4).map((vs) => (
                    <div key={vs.vendor} className="text-xs">
                      <span className="text-gray-300">{vs.vendor}</span>
                      <span
                        className={`ml-1 font-medium ${
                          vs.delta > 0 ? "text-green-400" : vs.delta < 0 ? "text-red-400" : "text-gray-500"
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
          <h2 className="text-lg font-semibold">Temporal Drift</h2>
          <p className="text-sm text-gray-400">
            Vendors with significant win rate changes over time (&gt;15% shift).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {drift.map((d) => (
              <div
                key={d.vendor}
                className={`rounded-lg p-4 border ${
                  d.delta > 0
                    ? "bg-green-900/20 border-green-800"
                    : "bg-red-900/20 border-red-800"
                }`}
              >
                <p className="font-medium text-gray-200">{d.vendor}</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Early</p>
                    <p className="text-sm font-medium">{pct(d.earlyWinRate)}</p>
                  </div>
                  <span className="text-gray-500">→</span>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Late</p>
                    <p className="text-sm font-medium">{pct(d.lateWinRate)}</p>
                  </div>
                  <div className="text-center ml-auto">
                    <p className="text-xs text-gray-400">Delta</p>
                    <p
                      className={`text-sm font-bold ${
                        d.delta > 0 ? "text-green-400" : "text-red-400"
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
