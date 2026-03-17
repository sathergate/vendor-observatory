import type { FactorDef, VendorFactorData, CategoryFactorSummary } from "@/lib/load-vendor-factors";
import { FactorBar } from "./FactorBar";

/** Stacked horizontal bars showing a vendor's scores across all factors. */
export function FactorProfile({
  vendor,
  factors,
  categorySummary,
}: {
  vendor: VendorFactorData;
  factors: FactorDef[];
  categorySummary: CategoryFactorSummary | null;
}) {
  return (
    <div className="bg-surface rounded-[6px] p-6 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-header">Factor Scores</h3>
        <div className="flex items-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[2px] bg-data-1/70" /> at or above avg
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[2px] bg-data-4/70" /> below avg
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-[2px] h-3 bg-text-secondary/60" /> category avg
          </span>
        </div>
      </div>
      <div className="space-y-0.5">
        {factors.map((f) => (
          <FactorBar
            key={f.id}
            label={f.short}
            score={vendor.scores[f.id] ?? null}
            categoryAvg={categorySummary?.avgScores[f.id] ?? 0}
            categoryBest={categorySummary?.bestScores[f.id] ?? 5}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted mt-3 italic">
        Composite score: {vendor.compositeScore.toFixed(1)} / 5.0
      </p>
    </div>
  );
}
