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
    <div className="bg-gray-800 rounded-lg p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueClassName ?? ""}`}>{value}</p>
      {subtext && <p className="text-xs text-gray-500 mt-0.5">{subtext}</p>}
    </div>
  );
}
