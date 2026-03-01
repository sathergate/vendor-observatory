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
        <h1 className="text-2xl font-bold text-primary">Competitive Landscape</h1>

        {!scorecard ? (
          <div className="quiet-signal">
            <p className="text-secondary">No data available yet.</p>
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
                <h2 className="section-header mb-3">Co-Mentions</h2>
                <p className="text-[12px] text-muted mb-3">
                  Vendors that appear most frequently in the same sessions as {vendorDisplayName(vendorId)}
                </p>
                <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="th-label text-left px-4 py-3">Vendor</th>
                        <th className="th-label text-right px-4 py-3">Shared Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coMentions.map((cm) => (
                        <tr key={cm.co_vendor} className="border-b border-border-subtle hover:bg-raised h-12">
                          <td className="px-4">
                            <Link
                              href={`/benchmarks/vendors/${encodeURIComponent(cm.co_vendor)}`}
                              className="text-accent hover:text-accent/80"
                            >
                              {vendorDisplayName(cm.co_vendor)}
                            </Link>
                          </td>
                          <td className="px-4 text-right text-primary font-data font-medium">{cm.session_count.toLocaleString()}</td>
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
                <h2 className="section-header mb-3">Competitors That Beat You</h2>
                <div className="bg-surface rounded-[6px] overflow-hidden border border-border">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="th-label text-left px-4 py-3">Competitor</th>
                        <th className="th-label text-right px-4 py-3">Wins Over You</th>
                        <th className="th-label text-left px-4 py-3">Scenarios</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scorecard.competitorWins.map((comp) => (
                        <tr key={comp.competitor} className="border-b border-border-subtle hover:bg-raised h-12">
                          <td className="px-4">
                            <Link
                              href={`/benchmarks/vendors/${encodeURIComponent(comp.competitor)}`}
                              className="text-accent hover:text-accent/80"
                            >
                              {vendorDisplayName(comp.competitor)}
                            </Link>
                          </td>
                          <td className="px-4 text-right text-data-4 font-data font-medium">{comp.count.toLocaleString()}</td>
                          <td className="px-4 text-secondary text-[12px]">
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
                <h2 className="section-header mb-3">
                  Head-to-Head: {vendorDisplayName(vendorId)} vs {vendorDisplayName(h2h.vendorB)}
                </h2>
                <div className="bg-surface rounded-[6px] p-4 border border-border">
                  <div className="flex gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-accent" />
                      <span className="text-[13px] text-primary">
                        {vendorDisplayName(vendorId)}: <span className="font-data">{h2h.aWins}</span> win{h2h.aWins !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-data-4" />
                      <span className="text-[13px] text-primary">
                        {vendorDisplayName(h2h.vendorB)}: <span className="font-data">{h2h.bWins}</span> win{h2h.bWins !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {h2h.ties > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-data-muted" />
                        <span className="text-[13px] text-primary">Ties: <span className="font-data">{h2h.ties}</span></span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {h2h.scenarios.map((s, i) => (
                      <div key={i} className="flex items-start gap-3 text-[13px]">
                        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                          s.winner === vendorId ? "bg-accent" :
                          s.winner === h2h.vendorB ? "bg-data-4" :
                          "bg-data-muted"
                        }`} />
                        <div>
                          <span className="text-primary">
                            {PROMPT_SUMMARIES[s.prompt_id]?.title || s.prompt_id}
                          </span>
                          {s.winner && (
                            <span className="text-[12px] text-muted ml-2">
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
              <div className="quiet-signal">
                <p className="text-secondary">No competitive data available yet.</p>
              </div>
            )}
          </>
        )}
      </VendorGuard>
    </div>
  );
}
