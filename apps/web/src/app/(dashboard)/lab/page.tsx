import { Breadcrumb } from "@/components/Breadcrumb";
import { FLAGS } from "@/lib/flags";
import Link from "next/link";
import { STARTER_ANALYSES } from "@/lib/saved-analyses";

export const dynamic = "force-dynamic";

export default function LabPage() {
  if (!FLAGS.LAB) {
    return (
      <div className="space-y-8">
        <div>
          <Breadcrumb items={[{ label: "Advanced / Lab" }]} />
          <h2 className="section-header">Advanced / Lab</h2>
          <p className="text-secondary text-[13px] mt-1">Query builder, saved analyses, and experimental tools.</p>
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
        <Breadcrumb items={[{ label: "Advanced / Lab" }]} />
        <h2 className="section-header">Advanced / Lab</h2>
        <p className="text-secondary text-[13px] mt-1">
          Composable query engine, saved analyses, and experimental analytics tools.
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/lab/query" className="bg-surface rounded-[6px] p-6 border border-border hover:border-accent/40 transition-colors block">
          <p className="text-[14px] font-medium text-primary">Query Builder</p>
          <p className="text-[12px] text-muted mt-1">Composable queries with 6 query types</p>
        </Link>
        <Link href="/lab/search" className="bg-surface rounded-[6px] p-6 border border-border hover:border-accent/40 transition-colors block">
          <p className="text-[14px] font-medium text-primary">Semantic Search</p>
          <p className="text-[12px] text-muted mt-1">Full-text search across rationale and trade-offs</p>
        </Link>
        <Link href="/lab/insights" className="bg-surface rounded-[6px] p-6 border border-border hover:border-accent/40 transition-colors block">
          <p className="text-[14px] font-medium text-primary">Cross-Session Insights</p>
          <p className="text-[12px] text-muted mt-1">Divergence, constraint influence, temporal drift</p>
        </Link>
      </div>

      {/* Saved analyses */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-header">Starter Analyses</h3>
          <button className="px-3 py-1.5 rounded-[6px] bg-accent text-[12px] font-medium hover:bg-accent/90 transition-colors">
            New Analysis
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STARTER_ANALYSES.map((analysis) => (
            <Link
              key={analysis.name}
              href={`/lab/query?type=${analysis.queryType}&${new URLSearchParams(analysis.queryParams).toString()}`}
              className="bg-surface rounded-[6px] p-4 border border-border hover:border-accent/40 transition-colors block"
            >
              <p className="text-[13px] font-medium text-primary">{analysis.name}</p>
              <p className="text-[12px] text-muted mt-1">{analysis.description}</p>
              <p className="text-[11px] text-accent mt-2 font-data">{analysis.queryType}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
