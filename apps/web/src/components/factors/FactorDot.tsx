import { vendorDisplayName } from "@/lib/vendor-taxonomy";

/** A positioned dot on a 1–5 scale line representing a vendor's score. */
export function FactorDot({
  vendorId,
  score,
  rank,
  total,
}: {
  vendorId: string;
  score: number | null;
  rank: number;
  total: number;
}) {
  if (score == null) return null;

  const pct = ((score - 1) / 4) * 100; // Map 1–5 to 0–100%
  const colors = ["bg-data-1", "bg-data-2", "bg-data-3", "bg-data-4", "bg-data-5"];
  const color = colors[rank % colors.length] ?? "bg-data-muted";

  return (
    <div
      className={`absolute w-3 h-3 rounded-full ${color} border border-base -translate-x-1/2 -translate-y-1/2 top-1/2 group cursor-pointer z-10`}
      style={{ left: `${pct}%` }}
      title={`${vendorDisplayName(vendorId)}: ${score}/5`}
    >
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-20 pointer-events-none">
        <div className="bg-raised border border-border rounded-[4px] px-2 py-1 whitespace-nowrap shadow-lg">
          <span className="text-[11px] text-primary">{vendorDisplayName(vendorId)}</span>
          <span className="font-data text-[12px] text-secondary ml-1.5">{score}</span>
        </div>
      </div>
    </div>
  );
}

/** Scale line with positioned dots for a single factor in a category. */
export function FactorScale({
  factorLabel,
  vendors,
}: {
  factorLabel: string;
  vendors: Array<{ vendorId: string; score: number | null }>;
}) {
  const scored = vendors
    .filter((v) => v.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="w-[120px] shrink-0 text-[13px] text-secondary truncate" title={factorLabel}>
        {factorLabel}
      </span>
      <div className="flex-1 relative h-6">
        {/* Scale background */}
        <div className="absolute inset-y-1/2 inset-x-0 h-[2px] -translate-y-1/2 bg-border-subtle rounded-full" />
        {/* Scale markers 1–5 */}
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
            style={{ left: `${((n - 1) / 4) * 100}%` }}
          >
            <div className="w-1 h-3 bg-border-subtle rounded-full" />
            <span className="absolute top-full mt-0.5 -translate-x-1/2 left-1/2 text-[9px] text-muted">
              {n}
            </span>
          </div>
        ))}
        {/* Vendor dots */}
        {scored.map((v, i) => (
          <FactorDot
            key={v.vendorId}
            vendorId={v.vendorId}
            score={v.score}
            rank={i}
            total={scored.length}
          />
        ))}
      </div>
    </div>
  );
}
