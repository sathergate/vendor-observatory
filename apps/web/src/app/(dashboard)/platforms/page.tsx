import { getPlatformComparison } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";
import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

export default async function PlatformsPage() {
  const data = await getPlatformComparison();

  return (
    <div>
      <Breadcrumb items={[{ label: "Platforms" }]} />
      <h2 className="section-header mb-2">Platform Comparison</h2>
      <p className="text-secondary text-[13px] mb-6">Side-by-side: what does Claude Code detect vs Codex CLI?</p>

      {data.length > 0 ? (
        <div className="bg-surface rounded-[6px] border border-border overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="th-label text-left px-4 h-12">Vendor</th>
                <th className="th-label text-right px-4 h-12">Claude Code</th>
                <th className="th-label text-right px-4 h-12">Codex CLI</th>
                <th className="th-label text-right px-4 h-12">Delta</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const delta = row.claude_code_count - row.codex_cli_count;
                const unique = row.claude_code_count === 0 || row.codex_cli_count === 0;
                return (
                  <tr key={row.vendor_canonical_id} className={`border-b border-border-subtle hover:bg-raised h-12 ${unique ? "bg-raised/50" : ""}`}>
                    <td className="px-4 py-2 text-primary font-medium">
                      {vendorDisplayName(row.vendor_canonical_id)}
                      {unique && <span className="ml-2 text-[11px] text-muted italic">unique</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-data-1"><span className="font-data">{row.claude_code_count ? Number(row.claude_code_count).toLocaleString() : "\u2014"}</span></td>
                    <td className="px-4 py-2 text-right text-data-2"><span className="font-data">{row.codex_cli_count ? Number(row.codex_cli_count).toLocaleString() : "\u2014"}</span></td>
                    <td className={`px-4 py-2 text-right ${delta > 0 ? "text-data-1" : delta < 0 ? "text-data-2" : "text-muted"}`}>
                      <span className="font-data">{delta > 0 ? `+${delta.toLocaleString()}` : delta === 0 ? "\u2014" : delta.toLocaleString()}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">No organic signal detected in this period.</p>
          <p className="text-muted text-[13px] italic mt-2">Ingest transcripts from multiple platforms to see comparison data.</p>
        </div>
      )}
    </div>
  );
}
