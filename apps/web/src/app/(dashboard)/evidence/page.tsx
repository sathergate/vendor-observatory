import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

export default function Evidence() {
  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Evidence" }]} />
        <h2 className="section-header">Evidence</h2>
        <p className="text-secondary text-[13px] mt-1">
          Browse session transcripts and benchmark cases backing every claim.
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
