export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 bg-surface rounded w-48" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-surface rounded-[6px]" />
        ))}
      </div>
      <div className="h-64 bg-surface rounded-[6px]" />
    </div>
  );
}
