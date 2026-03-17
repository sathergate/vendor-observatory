import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

export default function RejectionClusters() {
  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Reasons" }, { label: "Rejection Clusters" }]} />
        <h2 className="section-header">Rejection Clusters</h2>
        <p className="text-secondary text-[13px] mt-1">
          Clustered rejection patterns across vendors and constraints.
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
