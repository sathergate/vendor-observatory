import { Breadcrumb } from "@/components/Breadcrumb";
import { FLAGS } from "@/lib/flags";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EvidenceSessionsPage() {
  if (!FLAGS.REASONS_EVIDENCE) {
    return (
      <div className="space-y-8">
        <div>
          <Breadcrumb items={[{ label: "Evidence" }, { label: "Sessions" }]} />
          <h2 className="section-header">Sessions</h2>
          <p className="text-secondary text-[13px] mt-1">Session list with filters and transcript viewer.</p>
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
          <Breadcrumb items={[{ label: "Evidence" }, { label: "Sessions" }]} />
          <h2 className="section-header">Sessions</h2>
          <p className="text-secondary text-[13px] mt-1">
            Browse session transcripts backing every claim. Filter by vendor, platform, and constraints.
          </p>
        </div>
        <Link
          href="/evidence/sessions/diff"
          className="px-4 py-2 rounded-[6px] bg-surface border border-border text-[13px] font-medium text-secondary hover:text-primary hover:border-accent/40 transition-colors"
        >
          Compare Sessions
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 bg-surface rounded-[6px] p-3 border border-border">
        <select className="bg-raised rounded-[6px] px-3 py-1.5 text-[12px] text-secondary border border-border">
          <option value="">All Vendors</option>
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
        <select className="bg-raised rounded-[6px] px-3 py-1.5 text-[12px] text-secondary border border-border">
          <option value="all">All Sources</option>
          <option value="benchmark">Benchmark</option>
          <option value="organic">Organic</option>
        </select>
      </div>

      {/* Sessions list */}
      <div className="quiet-signal">
        <p className="text-secondary text-[14px]">No sessions to display</p>
        <p className="text-muted text-[13px] italic mt-2">
          Sessions will appear after running ingestion or benchmarks.
        </p>
      </div>
    </div>
  );
}
