import Link from "next/link";
import { getVendorScorecard, getVendorHeadToHead } from "@/lib/db";
import { vendorDisplayName, VENDOR_META, vendorCategory } from "../../vendor-taxonomy";
import { CATEGORY_META } from "../../categories";
import { PROMPT_SUMMARIES } from "../../prompt-summaries";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function generateRecommendations(scorecard: NonNullable<ReturnType<typeof getVendorScorecard>>): string[] {
  const recs: string[] = [];

  // 1. Low implementation rate
  if (scorecard.totalRecommendations > 0 && scorecard.implementationRate < 0.5) {
    recs.push(
      `Implementation rate is ${pct(scorecard.implementationRate)} — AI assistants recommend your tool but often don't write the setup code. Consider simplifying your SDK initialization or providing better AI-friendly documentation.`
    );
  }

  // 2. Constraint gaps — constraints that appear in prompts where vendor lost
  const topMissed = scorecard.constraintsMissed.slice(0, 3);
  for (const m of topMissed) {
    const label = m.constraint.replace(/_/g, " ");
    recs.push(
      `You are mentioned but not recommended in ${m.count} scenario${m.count > 1 ? "s" : ""} requiring "${label}". Consider improving your ${label} support or documentation.`
    );
  }

  // 3. Competitor losses
  for (const comp of scorecard.competitorWins.slice(0, 2)) {
    const compName = vendorDisplayName(comp.competitor);
    recs.push(
      `You lose to ${compName} in ${comp.count} head-to-head scenario${comp.count > 1 ? "s" : ""}. Review scenarios: ${comp.scenarios.map(s => PROMPT_SUMMARIES[s]?.title || s).join(", ")}.`
    );
  }

  // 4. Low win rate with high mentions
  if (scorecard.totalMentions > 3 && scorecard.winRate < 0.4) {
    recs.push(
      `Win rate is ${pct(scorecard.winRate)} across ${scorecard.totalMentions} mentions — you're considered but often lose to competitors. Analyze which constraints and scenarios you're losing on.`
    );
  }

  // 5. Gotcha themes
  if (scorecard.gotchaSnippets.length >= 2) {
    recs.push(
      `AI assistants flag ${scorecard.gotchaSnippets.length} gotcha${scorecard.gotchaSnippets.length > 1 ? "s" : ""} about your tool. Address these concerns in your documentation or product.`
    );
  }

  // 6. Single platform
  const platforms = Object.keys(scorecard.platformSplit);
  if (platforms.length === 1 && scorecard.totalRecommendations > 1) {
    recs.push(
      `Only recommended on ${platforms[0]} — consider improving discoverability for other AI assistants (documentation, npm package naming, example code).`
    );
  }

  return recs;
}

export default async function VendorScorecardPage({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor } = await params;
  const vendorId = decodeURIComponent(vendor);
  const scorecard = getVendorScorecard(vendorId);

  if (!scorecard) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/benchmarks" className="hover:text-blue-400">Benchmarks</Link>
          <span>/</span>
          <Link href="/benchmarks/vendors" className="hover:text-blue-400">Vendor Intel</Link>
          <span>/</span>
          <span className="text-gray-200">{vendorDisplayName(vendorId)}</span>
        </div>
        <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
          <p className="text-lg">No data found for &ldquo;{vendorDisplayName(vendorId)}&rdquo;</p>
          <p className="text-sm mt-2">This vendor hasn&apos;t appeared in any benchmark responses yet.</p>
        </div>
      </div>
    );
  }

  const meta = VENDOR_META[vendorId];
  const recommendations = generateRecommendations(scorecard);

  // Find top competitor for head-to-head
  const topCompetitor = scorecard.competitorWins[0];
  const h2h = topCompetitor ? getVendorHeadToHead(vendorId, topCompetitor.competitor) : null;

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/benchmarks" className="hover:text-blue-400 transition-colors">Benchmarks</Link>
        <span>/</span>
        <Link href="/benchmarks/vendors" className="hover:text-blue-400 transition-colors">Vendor Intel</Link>
        <span>/</span>
        <span className="text-gray-200">{vendorDisplayName(vendorId)}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{vendorDisplayName(vendorId)}</h1>
          <div className="flex items-center gap-3 mt-1">
            {meta?.website && (
              <span className="text-sm text-gray-500">{meta.website}</span>
            )}
            {meta?.category && CATEGORY_META[meta.category] && (
              <Link
                href={`/benchmarks/${meta.category}`}
                className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
              >
                {CATEGORY_META[meta.category].icon} {CATEGORY_META[meta.category].label}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── 1. Recommendation Profile ──────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recommendation Profile</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Primary Recommendations</p>
            <p className="text-2xl font-bold mt-1 text-blue-400">{scorecard.totalRecommendations}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Total Mentions</p>
            <p className="text-2xl font-bold mt-1">{scorecard.totalMentions}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Win Rate</p>
            <p className={`text-2xl font-bold mt-1 ${
              scorecard.winRate > 0.6 ? "text-green-400" : scorecard.winRate > 0.3 ? "text-yellow-400" : "text-red-400"
            }`}>
              {pct(scorecard.winRate)}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400">Implementation Rate</p>
            <p className={`text-2xl font-bold mt-1 ${
              scorecard.implementationRate > 0.6 ? "text-green-400" : scorecard.implementationRate > 0.3 ? "text-yellow-400" : "text-red-400"
            }`}>
              {pct(scorecard.implementationRate)}
            </p>
          </div>
        </div>

        {/* Platform split */}
        {Object.keys(scorecard.platformSplit).length > 0 && (
          <div className="mt-3 flex gap-2">
            {Object.entries(scorecard.platformSplit).map(([platform, count]) => (
              <span
                key={platform}
                className={`text-sm px-2 py-1 rounded ${
                  platform === "claude_code"
                    ? "bg-blue-900/50 text-blue-300"
                    : platform === "codex_cli"
                    ? "bg-green-900/50 text-green-300"
                    : "bg-purple-900/50 text-purple-300"
                }`}
              >
                {platform}: {count}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── 2. Category Breakdown ──────────────────────────────── */}
      {scorecard.categoryBreakdown.length > 0 && (
        <div>
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
      )}

      {/* ── 3. Constraint Scorecard ────────────────────────────── */}
      {(scorecard.constraintsAddressed.length > 0 || scorecard.constraintsMissed.length > 0) && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Constraint Scorecard</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Addressed */}
            {scorecard.constraintsAddressed.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-green-400 mb-3">✓ Constraints Addressed</h3>
                <div className="space-y-2">
                  {scorecard.constraintsAddressed.map((c) => (
                    <div key={c.constraint} className="flex justify-between text-sm">
                      <span className="text-gray-300">{c.constraint.replace(/_/g, " ")}</span>
                      <span className="text-green-400">{c.count}×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missed */}
            {scorecard.constraintsMissed.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-red-400 mb-3">✗ Constraints When Vendor Lost</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Constraints in prompts where this vendor was mentioned but a competitor was chosen
                </p>
                <div className="space-y-2">
                  {scorecard.constraintsMissed.map((c) => (
                    <div key={c.constraint} className="flex justify-between text-sm">
                      <span className="text-gray-300">{c.constraint.replace(/_/g, " ")}</span>
                      <span className="text-red-400">{c.count}×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 4. Competitive Landscape ───────────────────────────── */}
      {scorecard.competitorWins.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Competitive Landscape</h2>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-4 py-3">Competitor</th>
                  <th className="text-right px-4 py-3">Wins Over You</th>
                  <th className="text-left px-4 py-3">Scenarios</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.competitorWins.map((comp) => (
                  <tr key={comp.competitor} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-2">
                      <Link
                        href={`/benchmarks/vendors/${encodeURIComponent(comp.competitor)}`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {vendorDisplayName(comp.competitor)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right text-red-400 font-medium">{comp.count}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {comp.scenarios.map((s) => PROMPT_SUMMARIES[s]?.title || s).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Head to head detail with top competitor */}
          {h2h && h2h.scenarios.length > 0 && (
            <div className="mt-4 bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                Head-to-Head: {vendorDisplayName(vendorId)} vs {vendorDisplayName(h2h.vendorB)}
              </h3>
              <div className="flex gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm text-gray-300">{vendorDisplayName(vendorId)}: {h2h.aWins} win{h2h.aWins !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm text-gray-300">{vendorDisplayName(h2h.vendorB)}: {h2h.bWins} win{h2h.bWins !== 1 ? "s" : ""}</span>
                </div>
                {h2h.ties > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-gray-500" />
                    <span className="text-sm text-gray-300">Ties: {h2h.ties}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {h2h.scenarios.map((s, i) => {
                  const prompt = PROMPT_SUMMARIES[s.prompt_id];
                  return (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                        s.winner === vendorId ? "bg-blue-500" :
                        s.winner === h2h.vendorB ? "bg-red-500" :
                        "bg-gray-500"
                      }`} />
                      <div>
                        <Link
                          href={`/benchmarks/${s.category}`}
                          className="text-gray-300 hover:text-blue-400 transition-colors"
                        >
                          {prompt?.title || s.prompt_id}
                        </Link>
                        {s.winner && (
                          <span className="text-xs text-gray-500 ml-2">
                            → {vendorDisplayName(s.winner)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 5. Prompts Won & Lost ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scorecard.promptsWon.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-green-400 mb-3">
              ✓ Scenarios Won ({scorecard.promptsWon.length})
            </h3>
            <div className="space-y-2">
              {scorecard.promptsWon.map((p, i) => {
                const prompt = PROMPT_SUMMARIES[p.prompt_id];
                const catMeta = CATEGORY_META[p.category];
                return (
                  <div key={i} className="text-sm">
                    <Link
                      href={`/benchmarks/${p.category}`}
                      className="text-gray-300 hover:text-blue-400 transition-colors"
                    >
                      {prompt?.title || p.prompt_id}
                    </Link>
                    {catMeta && (
                      <span className="text-xs text-gray-500 ml-2">{catMeta.icon} {catMeta.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {scorecard.promptsLost.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-red-400 mb-3">
              ✗ Scenarios Lost ({scorecard.promptsLost.length})
            </h3>
            <div className="space-y-2">
              {scorecard.promptsLost.map((p, i) => {
                const prompt = PROMPT_SUMMARIES[p.prompt_id];
                return (
                  <div key={i} className="text-sm">
                    <Link
                      href={`/benchmarks/${p.category}`}
                      className="text-gray-300 hover:text-blue-400 transition-colors"
                    >
                      {prompt?.title || p.prompt_id}
                    </Link>
                    <span className="text-xs text-gray-500 ml-2">
                      → lost to{" "}
                      <Link
                        href={`/benchmarks/vendors/${encodeURIComponent(p.winner)}`}
                        className="text-red-400 hover:text-red-300"
                      >
                        {vendorDisplayName(p.winner)}
                      </Link>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── 6. Trade-offs & Gotchas ────────────────────────────── */}
      {(scorecard.tradeOffSnippets.length > 0 || scorecard.gotchaSnippets.length > 0) && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Trade-offs &amp; Gotchas Cited</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scorecard.tradeOffSnippets.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-yellow-400 mb-3">⚖ Trade-offs</h3>
                <div className="space-y-3">
                  {scorecard.tradeOffSnippets.map((s, i) => (
                    <p key={i} className="text-sm text-gray-300 border-l-2 border-yellow-800 pl-3">
                      {s}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {scorecard.gotchaSnippets.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-orange-400 mb-3">⚠ Gotchas</h3>
                <div className="space-y-3">
                  {scorecard.gotchaSnippets.map((s, i) => (
                    <p key={i} className="text-sm text-gray-300 border-l-2 border-orange-800 pl-3">
                      {s}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 7. Rationale Snippets ──────────────────────────────── */}
      {scorecard.rationaleSnippets.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Why AI Recommends This Vendor</h2>
          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            {scorecard.rationaleSnippets.map((s, i) => (
              <p key={i} className="text-sm text-gray-300 border-l-2 border-blue-800 pl-3">
                {s}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── 8. Actionable Recommendations ──────────────────────── */}
      {recommendations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            🎯 Actionable Recommendations
          </h2>
          <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-lg p-5 space-y-4">
            <p className="text-xs text-gray-400">
              Generated from benchmark data — specific actions to improve AI recommendation ranking
            </p>
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-blue-400 font-bold mt-0.5">{i + 1}.</span>
                <p className="text-sm text-gray-200">{rec}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
