import Link from "next/link";
import { getVendorScorecard, getVendorHeadToHead, getVendorCoMentions } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SectionNav } from "@/components/SectionNav";
import { VendorGuard } from "@/components/VendorGuard";
import { PROMPT_SUMMARIES } from "../../../prompt-summaries";

export const dynamic = "force-dynamic";

export default async function CompetitivePage({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor } = await params;
  const vendorId = decodeURIComponent(vendor);
  const [scorecard, coMentions] = await Promise.all([
    getVendorScorecard(vendorId),
    getVendorCoMentions(vendorId),
  ]);

  const topCompetitor = scorecard?.competitorWins[0];
  const h2h = topCompetitor ? await getVendorHeadToHead(vendorId, topCompetitor.competitor) : null;

  return (
    <div className="space-y-8">
      <Breadcrumb items={[
        { label: "Home", href: "/" },
        { label: vendorDisplayName(vendorId), href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}` },
        { label: "Competitive Landscape" },
      ]} />

      <VendorGuard vendorId={vendorId}>
        <h1 className="text-2xl font-bold">Competitive Landscape</h1>

        {!scorecard ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
            <p>No data available yet.</p>
          </div>
        ) : (
          <>
            <SectionNav sections={[
              ...(coMentions.length > 0 ? [{ id: "co-mentions", label: "Co-Mentions" }] : []),
              ...(scorecard.competitorWins.length > 0 ? [{ id: "wins-over-you", label: "Wins Over You" }] : []),
              ...(h2h && h2h.scenarios.length > 0 ? [{ id: "head-to-head", label: "Head-to-Head" }] : []),
            ]} />

            {/* Co-mention Table */}
            {coMentions.length > 0 && (
              <div id="co-mentions">
                <h2 className="text-lg font-semibold mb-3">Co-Mentions</h2>
                <p className="text-xs text-gray-500 mb-3">
                  Vendors that appear most frequently in the same sessions as {vendorDisplayName(vendorId)}
                </p>
                <div className="bg-gray-800 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-400">
                        <th className="text-left px-4 py-3">Vendor</th>
                        <th className="text-right px-4 py-3">Shared Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coMentions.map((cm) => (
                        <tr key={cm.co_vendor} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                          <td className="px-4 py-2">
                            <Link
                              href={`/benchmarks/vendors/${encodeURIComponent(cm.co_vendor)}`}
                              className="text-blue-400 hover:text-blue-300"
                            >
                              {vendorDisplayName(cm.co_vendor)}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-300 font-medium">{cm.session_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Wins Over You */}
            {scorecard.competitorWins.length > 0 && (
              <div id="wins-over-you">
                <h2 className="text-lg font-semibold mb-3">Competitors That Beat You</h2>
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
              </div>
            )}

            {/* Head-to-Head */}
            {h2h && h2h.scenarios.length > 0 && (
              <div id="head-to-head">
                <h2 className="text-lg font-semibold mb-3">
                  Head-to-Head: {vendorDisplayName(vendorId)} vs {vendorDisplayName(h2h.vendorB)}
                </h2>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="flex gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500" />
                      <span className="text-sm text-gray-300">
                        {vendorDisplayName(vendorId)}: {h2h.aWins} win{h2h.aWins !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-sm text-gray-300">
                        {vendorDisplayName(h2h.vendorB)}: {h2h.bWins} win{h2h.bWins !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {h2h.ties > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-gray-500" />
                        <span className="text-sm text-gray-300">Ties: {h2h.ties}</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {h2h.scenarios.map((s, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                          s.winner === vendorId ? "bg-blue-500" :
                          s.winner === h2h.vendorB ? "bg-red-500" :
                          "bg-gray-500"
                        }`} />
                        <div>
                          <span className="text-gray-300">
                            {PROMPT_SUMMARIES[s.prompt_id]?.title || s.prompt_id}
                          </span>
                          {s.winner && (
                            <span className="text-xs text-gray-500 ml-2">
                              won by {vendorDisplayName(s.winner)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {coMentions.length === 0 && scorecard.competitorWins.length === 0 && (
              <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
                <p>No competitive data available yet.</p>
              </div>
            )}
          </>
        )}
      </VendorGuard>
    </div>
  );
}
