export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="h-4 w-96 bg-surface rounded mt-2" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-surface rounded-[6px]" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-32 bg-surface rounded-[6px]" />
        ))}
      </div>
      <div className="h-64 bg-surface rounded-[6px]" />
    </div>
  );
}
