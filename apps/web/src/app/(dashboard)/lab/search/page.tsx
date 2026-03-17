import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

export default function Search() {
  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Lab" }, { label: "Search" }]} />
        <h2 className="section-header">Search</h2>
        <p className="text-secondary text-[13px] mt-1">
          Full-text semantic search across rationale, trade-offs, and gotchas.
        </p>
      </div>
      <div className="quiet-signal">
        <p className="text-secondary text-[14px]">Coming soon</p>
        <p className="text-muted text-[13px] italic mt-2">
          This feature is under development.
        </p>
      </div>
    </div>
  );
}
