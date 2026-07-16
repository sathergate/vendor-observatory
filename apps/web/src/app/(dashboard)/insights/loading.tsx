export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-8 w-56 bg-surface rounded" />
        <div className="h-4 w-96 bg-surface rounded mt-2" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-surface rounded-[6px]" />
        ))}
      </div>
      <div className="h-64 bg-surface rounded-[6px]" />
      <div className="h-48 bg-surface rounded-[6px]" />
    </div>
  );
}
