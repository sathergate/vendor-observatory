import { Breadcrumb } from "@/components/Breadcrumb";
import { FLAGS } from "@/lib/flags";
import Link from "next/link";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  too_expensive: { label: "Too Expensive", color: "text-data-3" },
  too_complex: { label: "Too Complex", color: "text-data-3" },
  poor_docs: { label: "Poor Docs", color: "text-data-1" },
  not_available_region: { label: "Region Unavailable", color: "text-data-2" },
  feature_gap: { label: "Feature Gap", color: "text-data-4" },
  trust_concerns: { label: "Trust Concerns", color: "text-data-4" },
  vendor_lock_in: { label: "Vendor Lock-in", color: "text-data-2" },
};

export default async function RejectionClustersPage() {
  if (!FLAGS.REASONS_EVIDENCE) {
    return (
      <div className="space-y-8">
        <div>
          <Breadcrumb items={[{ label: "Reasons" }, { label: "Rejection Clusters" }]} />
          <h2 className="section-header">Rejection Clusters</h2>
          <p className="text-secondary text-[13px] mt-1">Clustered rejection patterns across vendors and constraints.</p>
        </div>
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">Coming soon</p>
          <p className="text-muted text-[13px] italic mt-2">This feature is under development.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <Breadcrumb items={[{ label: "Reasons" }, { label: "Rejection Clusters" }]} />
          <h2 className="section-header">Rejection Clusters</h2>
          <p className="text-secondary text-[13px] mt-1">
            Why vendors get rejected, clustered by reason. Each cluster can generate a remediation issue.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 bg-surface rounded-[6px] p-3 border border-border">
        <select className="bg-raised rounded-[6px] px-3 py-1.5 text-[12px] text-secondary border border-border">
          <option value="">All Vendors</option>
        </select>
        <select className="bg-raised rounded-[6px] px-3 py-1.5 text-[12px] text-secondary border border-border">
          <option value="">All Competitors</option>
        </select>
        <select className="bg-raised rounded-[6px] px-3 py-1.5 text-[12px] text-secondary border border-border">
          <option value="">All Constraints</option>
        </select>
        <select className="bg-raised rounded-[6px] px-3 py-1.5 text-[12px] text-secondary border border-border">
          <option value="">All Platforms</option>
          <option value="claude_code">Claude Code</option>
          <option value="codex_cli">Codex CLI</option>
          <option value="cursor">Cursor</option>
        </select>
        <select className="bg-raised rounded-[6px] px-3 py-1.5 text-[12px] text-secondary border border-border">
          <option value="">All Time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {/* Rejection reason clusters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(REASON_LABELS).map(([reason, { label, color }]) => (
          <div key={reason} className="bg-surface rounded-[6px] p-6 border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className={`font-medium text-[14px] ${color}`}>{label}</span>
              <span className="font-data text-[14px] text-secondary">--</span>
            </div>
            <p className="text-[12px] text-muted mb-4">
              Rejection data will appear after ingestion.
            </p>
            <Link
              href={`/fixes/issues?reason=${reason}`}
              className="text-[12px] text-accent hover:text-accent/80 font-medium"
            >
              Create remediation issue &rarr;
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
