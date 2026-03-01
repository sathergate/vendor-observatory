export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-4 w-24 bg-surface rounded mb-4" />
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-4 w-72 bg-surface rounded mt-2" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-surface rounded-[6px]" />
        ))}
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-surface rounded-[6px]" />
        ))}
      </div>
    </div>
  );
}
