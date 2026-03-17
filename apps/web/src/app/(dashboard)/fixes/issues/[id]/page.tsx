import { Breadcrumb } from "@/components/Breadcrumb";
import { FLAGS } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default async function RemediationIssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!FLAGS.REMEDIATION) {
    return (
      <div className="space-y-8">
        <Breadcrumb items={[{ label: "Fixes" }, { label: "Issues", href: "/fixes/issues" }, { label: id }]} />
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">Remediation workflow not enabled</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Breadcrumb items={[{ label: "Fixes" }, { label: "Issues", href: "/fixes/issues" }, { label: `Issue ${id.slice(0, 8)}` }]} />

      {/* Issue header */}
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[20px] font-bold text-primary">Issue {id.slice(0, 8)}</h1>
            <p className="text-[13px] text-muted mt-1">Issue details will load from the database when connected.</p>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-muted bg-raised">
              Backlog
            </span>
          </div>
        </div>
      </div>

      {/* Status transitions */}
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <h2 className="section-header mb-3">Status</h2>
        <div className="flex gap-2">
          {["backlog", "in_progress", "shipped", "verified"].map((status) => (
            <button key={status} className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-secondary bg-raised hover:bg-border-subtle transition-colors">
              {status.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Evidence panel */}
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <h2 className="section-header mb-3">Evidence</h2>
        <p className="text-[13px] text-muted">No evidence refs attached yet.</p>
      </div>

      {/* Impact measurement */}
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <h2 className="section-header mb-3">Impact Measurement</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="stat-label">Recommendation Share</p>
            <p className="stat-hero text-muted mt-1">--</p>
          </div>
          <div>
            <p className="stat-label">Implementation Conversion</p>
            <p className="stat-hero text-muted mt-1">--</p>
          </div>
          <div>
            <p className="stat-label">Time to Remediation</p>
            <p className="stat-hero text-muted mt-1">--</p>
          </div>
        </div>
        <button className="mt-4 px-4 py-2 rounded-[6px] bg-accent text-[13px] font-medium hover:bg-accent/90 transition-colors">
          Verify Impact
        </button>
      </div>
    </div>
  );
}
