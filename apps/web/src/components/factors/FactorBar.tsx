/** Single horizontal bar showing a vendor's score for one factor (out of 5). */
export function FactorBar({
  label,
  score,
  categoryAvg,
  categoryBest,
}: {
  label: string;
  score: number | null;
  categoryAvg: number;
  categoryBest: number;
}) {
  if (score == null) {
    return (
      <div className="flex items-center gap-3 py-2">
        <span className="w-[120px] shrink-0 text-[13px] text-secondary truncate">{label}</span>
        <div className="flex-1 h-6 bg-signal-absent rounded-[3px] relative">
          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-muted italic">
            Not assessed
          </span>
        </div>
        <span className="w-8 text-right font-data text-[13px] text-muted">—</span>
      </div>
    );
  }

  const pct = (score / 5) * 100;
  const avgPct = (categoryAvg / 5) * 100;
  const belowAvg = score < categoryAvg;

  return (
    <div className="flex items-center gap-3 py-2 group">
      <span className="w-[120px] shrink-0 text-[13px] text-secondary truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 h-6 bg-raised rounded-[3px] relative">
        {/* Category best (ghost bar) */}
        <div
          className="absolute inset-y-0 left-0 bg-border-subtle/30 rounded-[3px]"
          style={{ width: `${(categoryBest / 5) * 100}%` }}
        />
        {/* Vendor score bar */}
        <div
          className={`absolute inset-y-0 left-0 rounded-[3px] transition-all ${
            belowAvg ? "bg-data-4/70" : "bg-data-1/70"
          }`}
          style={{ width: `${pct}%` }}
        />
        {/* Category average marker */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-text-secondary/60"
          style={{ left: `${avgPct}%` }}
          title={`Category avg: ${categoryAvg.toFixed(1)}`}
        />
        {/* Hover tooltip */}
        <div className="absolute inset-0 flex items-center px-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[11px] text-muted">
            avg {categoryAvg.toFixed(1)} · best {categoryBest}
          </span>
        </div>
      </div>
      <span className={`w-8 text-right font-data text-[14px] font-medium ${
        belowAvg ? "text-data-4" : "text-primary"
      }`}>
        {score}
      </span>
    </div>
  );
}
