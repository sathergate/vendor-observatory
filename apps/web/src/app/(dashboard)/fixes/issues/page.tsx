import { Breadcrumb } from "@/components/Breadcrumb";
import { FLAGS } from "@/lib/flags";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  backlog: { label: "Backlog", color: "text-muted", bg: "bg-raised" },
  in_progress: { label: "In Progress", color: "text-data-3", bg: "bg-data-3/10" },
  shipped: { label: "Shipped", color: "text-data-1", bg: "bg-data-1/10" },
  verified: { label: "Verified", color: "text-data-5", bg: "bg-data-5/10" },
  wont_fix: { label: "Won't Fix", color: "text-muted", bg: "bg-raised" },
};

export default async function RemediationIssuesPage() {
  if (!FLAGS.REMEDIATION) {
    return (
      <div className="space-y-8">
        <div>
          <Breadcrumb items={[{ label: "Fixes" }, { label: "Remediation Issues" }]} />
          <h2 className="section-header">Remediation Issues</h2>
          <p className="text-secondary text-[13px] mt-1">
            Track and verify fixes from identified loss patterns.
          </p>
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
          <Breadcrumb items={[{ label: "Fixes" }, { label: "Remediation Issues" }]} />
          <h2 className="section-header">Remediation Issues</h2>
          <p className="text-secondary text-[13px] mt-1">
            Auto-generated from rejection clusters. Each issue links to evidence and tracks impact.
          </p>
        </div>
        <button className="px-4 py-2 rounded-[6px] bg-accent text-[13px] font-medium hover:bg-accent/90 transition-colors">
          Generate Issues
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2">
        {Object.entries(STATUS_STYLES).map(([key, style]) => (
          <span key={key} className={`px-3 py-1.5 rounded-[6px] text-[12px] font-medium ${style.color} ${style.bg}`}>
            {style.label}
          </span>
        ))}
      </div>

      {/* Issue queue */}
      <div className="quiet-signal">
        <p className="text-secondary text-[14px]">No remediation issues yet</p>
        <p className="text-muted text-[13px] italic mt-2">
          Click &ldquo;Generate Issues&rdquo; to create issues from rejection clusters, or create issues manually from the Reasons page.
        </p>
      </div>

      {/* Workflow explanation */}
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <h3 className="section-header mb-3">How it works</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-center">
          {[
            { step: "1", label: "Loss Detected", detail: "Rejection cluster identified" },
            { step: "2", label: "Issue Created", detail: "Evidence attached automatically" },
            { step: "3", label: "Owner Assigned", detail: "Team takes ownership" },
            { step: "4", label: "Fix Shipped", detail: "Docs/SDK/product change deployed" },
            { step: "5", label: "Impact Verified", detail: "Before/after metrics compared" },
          ].map((s) => (
            <div key={s.step} className="space-y-1">
              <div className="w-8 h-8 rounded-full bg-raised border border-border flex items-center justify-center mx-auto">
                <span className="font-data text-[13px] text-primary">{s.step}</span>
              </div>
              <p className="text-[13px] font-medium text-primary">{s.label}</p>
              <p className="text-[11px] text-muted">{s.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
