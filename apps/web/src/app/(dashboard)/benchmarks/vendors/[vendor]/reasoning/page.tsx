import { getVendorScorecard } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SectionNav } from "@/components/SectionNav";
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
        <h1 className="text-2xl font-bold">Reasoning Samples</h1>

        {!scorecard || !hasAnyData ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
            <p>No reasoning samples available yet.</p>
          </div>
        ) : (
          <>
            <SectionNav sections={[
              ...(hasRationale ? [{ id: "rationale", label: "Why Recommended" }] : []),
              ...(hasTradeOffs ? [{ id: "tradeoffs", label: "Trade-offs" }] : []),
              ...(hasGotchas ? [{ id: "gotchas", label: "Gotchas" }] : []),
            ]} />

            {/* Rationale Snippets */}
            {hasRationale && (
              <div id="rationale">
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

            {/* Trade-off Snippets */}
            {hasTradeOffs && (
              <div id="tradeoffs">
                <h2 className="text-lg font-semibold mb-3">Trade-offs Cited</h2>
                <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                  {scorecard.tradeOffSnippets.map((s, i) => (
                    <p key={i} className="text-sm text-gray-300 border-l-2 border-yellow-800 pl-3">
                      {s}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Gotcha Snippets */}
            {hasGotchas && (
              <div id="gotchas">
                <h2 className="text-lg font-semibold mb-3">Gotchas / Caveats</h2>
                <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                  {scorecard.gotchaSnippets.map((s, i) => (
                    <p key={i} className="text-sm text-gray-300 border-l-2 border-orange-800 pl-3">
                      {s}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </VendorGuard>
    </div>
  );
}
