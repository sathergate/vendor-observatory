export function StatCard({
  label,
  value,
  subtext,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  valueClassName?: string;
}) {
  return (
    <div className="bg-surface rounded-[6px] p-6 border border-border">
      <p className="stat-label">{label}</p>
      <p className={`stat-hero mt-1 ${valueClassName ?? ""}`}>{value}</p>
      {subtext && <p className="stat-context mt-1">{subtext}</p>}
    </div>
  );
}
