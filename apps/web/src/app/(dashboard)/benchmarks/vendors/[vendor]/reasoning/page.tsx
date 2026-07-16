import { getVendorScorecard } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { TabbedView, TabPanel } from "@/components/TabbedView";
import { VendorGuard } from "@/components/VendorGuard";

export const dynamic = "force-dynamic";

export default async function ReasoningPage({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor } = await params;
  const vendorId = decodeURIComponent(vendor);
  const scorecard = await getVendorScorecard(vendorId);

  const hasRationale = (scorecard?.rationaleSnippets.length ?? 0) > 0;
  const hasTradeOffs = (scorecard?.tradeOffSnippets.length ?? 0) > 0;
  const hasGotchas = (scorecard?.gotchaSnippets.length ?? 0) > 0;
  const hasAnyData = hasRationale || hasTradeOffs || hasGotchas;

  return (
    <div className="space-y-8">
      <Breadcrumb items={[
        { label: "Home", href: "/" },
        { label: vendorDisplayName(vendorId), href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}` },
        { label: "Reasoning Samples" },
      ]} />

      <VendorGuard vendorId={vendorId}>
        <h1 className="text-2xl font-bold text-primary">Reasoning Samples</h1>

        {!scorecard || !hasAnyData ? (
          <div className="quiet-signal">
            <p className="text-secondary">No reasoning samples available yet.</p>
          </div>
        ) : (
          <>
            <TabbedView sections={[
              ...(hasRationale ? [{ id: "rationale", label: "Why Recommended" }] : []),
              ...(hasTradeOffs ? [{ id: "tradeoffs", label: "Trade-offs" }] : []),
              ...(hasGotchas ? [{ id: "gotchas", label: "Gotchas" }] : []),
            ]}>

            {/* Rationale Snippets */}
            {hasRationale && (
              <TabPanel id="rationale"><div>
                <h2 className="section-header mb-3">Why AI Recommends This Vendor</h2>
                <div className="bg-surface rounded-[6px] p-4 space-y-3 border border-border">
                  {scorecard.rationaleSnippets.map((s, i) => (
                    <p key={i} className="text-[13px] text-primary border-l-2 border-accent pl-3">
                      {s}
                    </p>
                  ))}
                </div>
              </div></TabPanel>
            )}

            {/* Trade-off Snippets */}
            {hasTradeOffs && (
              <TabPanel id="tradeoffs"><div>
                <h2 className="section-header mb-3">Trade-offs Cited</h2>
                <div className="bg-surface rounded-[6px] p-4 space-y-3 border border-border">
                  {scorecard.tradeOffSnippets.map((s, i) => (
                    <p key={i} className="text-[13px] text-primary border-l-2 border-data-3 pl-3">
                      {s}
                    </p>
                  ))}
                </div>
              </div></TabPanel>
            )}

            {/* Gotcha Snippets */}
            {hasGotchas && (
              <TabPanel id="gotchas"><div>
                <h2 className="section-header mb-3">Gotchas / Caveats</h2>
                <div className="bg-surface rounded-[6px] p-4 space-y-3 border border-border">
                  {scorecard.gotchaSnippets.map((s, i) => (
                    <p key={i} className="text-[13px] text-primary border-l-2 border-data-4 pl-3">
                      {s}
                    </p>
                  ))}
                </div>
              </div></TabPanel>
            )}
          </TabbedView>
          </>
        )}
      </VendorGuard>
    </div>
  );
}
