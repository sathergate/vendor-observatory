import { Breadcrumb } from "@/components/Breadcrumb";
import { FLAGS } from "@/lib/flags";
import Link from "next/link";

export const dynamic = "force-dynamic";

const QUERY_TYPES = [
  { id: "vendorWinRate", label: "Vendor Win Rate", description: "Win rate for a vendor across scenarios" },
  { id: "constraintCorrelation", label: "Constraint Correlation", description: "How constraints affect vendor selection" },
  { id: "platformComparison", label: "Platform Comparison", description: "Cross-platform recommendation differences" },
  { id: "headToHead", label: "Head-to-Head", description: "Direct comparison between two vendors" },
  { id: "promptDifficulty", label: "Prompt Difficulty", description: "Shannon entropy of vendor distribution per prompt" },
  { id: "whatIf", label: "What-If Simulation", description: "Simulate adding/removing constraints" },
];

export default function LabQueryPage() {
  // If LAB flag is off, redirect hint to legacy /query
  if (!FLAGS.LAB) {
    return (
      <div className="space-y-8">
        <div>
          <Breadcrumb items={[{ label: "Lab", href: "/lab" }, { label: "Query Builder" }]} />
          <h2 className="section-header">Query Builder</h2>
          <p className="text-secondary text-[13px] mt-1">
            The query builder is available at{" "}
            <Link href="/query" className="text-accent hover:text-accent/80">/query</Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Lab", href: "/lab" }, { label: "Query Builder" }]} />
        <h2 className="section-header">Query Builder</h2>
        <p className="text-secondary text-[13px] mt-1">
          Composable query engine for custom vendor analysis. Select a query type to begin.
        </p>
      </div>

      {/* Query type selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {QUERY_TYPES.map((qt) => (
          <button key={qt.id} className="bg-surface rounded-[6px] p-4 border border-border hover:border-accent/40 transition-colors text-left">
            <p className="text-[13px] font-medium text-primary">{qt.label}</p>
            <p className="text-[12px] text-muted mt-1">{qt.description}</p>
          </button>
        ))}
      </div>

      {/* Query result area */}
      <div className="bg-surface rounded-[6px] p-6 border border-border min-h-[200px]">
        <p className="text-[13px] text-muted text-center py-8">
          Select a query type above to build your analysis
        </p>
      </div>
    </div>
  );
}
