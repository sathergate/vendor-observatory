import { Breadcrumb } from "@/components/Breadcrumb";
import { FLAGS } from "@/lib/flags";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  install_path: { label: "Install Path", icon: ">" },
  env_var_docs: { label: "Env Vars", icon: "$" },
  quickstart: { label: "Quickstart", icon: "#" },
  examples: { label: "Examples", icon: "{}" },
  troubleshooting: { label: "Troubleshooting", icon: "!" },
  api_reference: { label: "API Reference", icon: "@" },
  migration_guide: { label: "Migration", icon: "~" },
};

export default async function DocsRemediationPage() {
  if (!FLAGS.DOCS_REMEDIATION) {
    return (
      <div className="space-y-8">
        <div>
          <Breadcrumb items={[{ label: "Fixes" }, { label: "Docs/SDK Patches" }]} />
          <h2 className="section-header">Docs/SDK Patches</h2>
          <p className="text-secondary text-[13px] mt-1">
            Documentation and SDK improvement suggestions based on evidence.
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
      <div>
        <Breadcrumb items={[{ label: "Fixes" }, { label: "Docs/SDK Patches" }]} />
        <h2 className="section-header">Docs/SDK Patches</h2>
        <p className="text-secondary text-[13px] mt-1">
          Heuristic-based documentation improvement suggestions derived from rejection patterns and low implementation rates.
        </p>
      </div>

      {/* Patch categories overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {Object.entries(CATEGORY_LABELS).map(([key, { label, icon }]) => (
          <div key={key} className="bg-surface rounded-[6px] p-3 border border-border text-center">
            <span className="font-data text-[16px] text-accent">{icon}</span>
            <p className="text-[11px] text-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Patches list */}
      <div className="quiet-signal">
        <p className="text-secondary text-[14px]">No patches generated yet</p>
        <p className="text-muted text-[13px] italic mt-2">
          Patches are generated from rejection analysis and implementation rate data.
        </p>
      </div>

      {/* Competitor doc gap section */}
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <h3 className="section-header mb-3">Competitor Doc Gaps</h3>
        <p className="text-[13px] text-secondary">
          Rubric-based comparison showing where competitor documentation outperforms yours,
          linked to scenarios where competitors win.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          {["Install docs clarity", "Examples coverage", "Troubleshooting", "Platform constraints"].map((dim) => (
            <div key={dim} className="p-3 rounded-[6px] bg-raised border border-border-subtle">
              <p className="text-[12px] text-primary font-medium">{dim}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 bg-base rounded-[4px] h-2">
                  <div className="h-2 rounded-[4px] bg-data-muted" style={{ width: "50%" }} />
                </div>
                <span className="text-[11px] font-data text-muted">--</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
