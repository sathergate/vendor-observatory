import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

export default function SessionDiffPage() {
  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Evidence" }, { label: "Sessions", href: "/evidence/sessions" }, { label: "Compare" }]} />
        <h2 className="section-header">Session Diff</h2>
        <p className="text-secondary text-[13px] mt-1">
          Compare two sessions side-by-side to see differences in vendor recommendations, tool actions, and constraints.
        </p>
      </div>

      {/* Session selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface rounded-[6px] p-6 border border-border">
          <h3 className="text-[13px] font-medium text-primary mb-3">Session A</h3>
          <input
            type="text"
            placeholder="Enter session ID or search..."
            className="w-full bg-raised rounded-[6px] px-3 py-2 text-[13px] text-primary border border-border placeholder:text-muted"
          />
        </div>
        <div className="bg-surface rounded-[6px] p-6 border border-border">
          <h3 className="text-[13px] font-medium text-primary mb-3">Session B</h3>
          <input
            type="text"
            placeholder="Enter session ID or search..."
            className="w-full bg-raised rounded-[6px] px-3 py-2 text-[13px] text-primary border border-border placeholder:text-muted"
          />
        </div>
      </div>

      {/* Diff categories */}
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <h3 className="section-header mb-3">Diff Categories</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-[6px] bg-raised border border-border-subtle">
            <p className="text-[13px] font-medium text-primary">Recommended Vendors</p>
            <p className="text-[12px] text-muted mt-1">Which vendors each session recommended</p>
          </div>
          <div className="p-4 rounded-[6px] bg-raised border border-border-subtle">
            <p className="text-[13px] font-medium text-primary">Tool Actions</p>
            <p className="text-[12px] text-muted mt-1">Installs, config writes, import changes</p>
          </div>
          <div className="p-4 rounded-[6px] bg-raised border border-border-subtle">
            <p className="text-[13px] font-medium text-primary">Constraints & Caveats</p>
            <p className="text-[12px] text-muted mt-1">Technical constraints and warnings mentioned</p>
          </div>
        </div>
      </div>

      <div className="quiet-signal">
        <p className="text-secondary text-[14px]">Select two sessions to compare</p>
      </div>
    </div>
  );
}
