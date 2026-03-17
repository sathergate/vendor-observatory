import { Breadcrumb } from "@/components/Breadcrumb";

export const dynamic = "force-dynamic";

export default function Transcripts() {
  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Evidence" }, { label: "Transcripts" }]} />
        <h2 className="section-header">Transcripts</h2>
        <p className="text-secondary text-[13px] mt-1">
          Full transcript viewer with vendor mention highlighting.
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
