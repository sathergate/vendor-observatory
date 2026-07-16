import type { ImprovementSuggestion, ImprovementPriority, ImpactLevel } from "@/lib/factor-improvements";

const PRIORITY_STYLES: Record<ImprovementPriority, { dot: string; label: string; bg: string }> = {
  critical: { dot: "bg-data-4", label: "Critical", bg: "bg-data-4/10" },
  high: { dot: "bg-data-3", label: "High", bg: "bg-data-3/10" },
  medium: { dot: "bg-data-2", label: "Medium", bg: "bg-data-2/10" },
  low: { dot: "bg-data-muted", label: "Low", bg: "bg-raised" },
};

const IMPACT_LABELS: Record<ImpactLevel, string> = {
  very_high: "Very High Impact",
  high: "High Impact",
  medium: "Medium Impact",
  low: "Low Impact",
};

export function ImprovementCard({ suggestion }: { suggestion: ImprovementSuggestion }) {
  const pstyle = PRIORITY_STYLES[suggestion.priority];

  return (
    <div className="bg-surface rounded-[6px] p-5 border border-border">
      <div className="flex items-start gap-3">
        {/* Priority dot */}
        <div className={`w-2.5 h-2.5 rounded-full ${pstyle.dot} mt-1.5 shrink-0`} />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[14px] font-medium text-primary">{suggestion.title}</h4>
            <span className={`px-2 py-0.5 rounded-[4px] text-[11px] font-medium ${pstyle.bg} ${
              suggestion.priority === "critical" ? "text-data-4" :
              suggestion.priority === "high" ? "text-data-3" :
              suggestion.priority === "medium" ? "text-data-2" : "text-muted"
            }`}>
              {pstyle.label}
            </span>
            <span className="px-2 py-0.5 rounded-[4px] text-[11px] bg-raised text-muted">
              {IMPACT_LABELS[suggestion.impact]}
            </span>
          </div>

          {/* Factor label and scores */}
          <div className="flex items-center gap-3 mt-1.5 text-[12px] text-muted">
            <span>{suggestion.factorLabel}</span>
            <span className="text-border">·</span>
            <span>
              Score <span className="font-data text-secondary">{suggestion.score}</span>/5
            </span>
            <span className="text-border">·</span>
            <span>
              Category avg <span className="font-data text-secondary">{suggestion.categoryAvg}</span>
            </span>
            {suggestion.gap > 0 && (
              <>
                <span className="text-border">·</span>
                <span>
                  Gap to best: <span className="font-data text-data-4">{suggestion.gap}</span>
                </span>
              </>
            )}
          </div>

          {/* Description */}
          <p className="text-[13px] text-secondary mt-2.5 leading-relaxed">
            {suggestion.description}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ImprovementList({ suggestions }: { suggestions: ImprovementSuggestion[] }) {
  if (suggestions.length === 0) {
    return (
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <p className="text-[14px] text-secondary">No improvement suggestions</p>
        <p className="text-[13px] text-muted italic mt-1">
          All factors score 4 or above — strong AI-recommendation readiness.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.map((s) => (
        <ImprovementCard key={`${s.vendorId}-${s.factorId}`} suggestion={s} />
      ))}
    </div>
  );
}
