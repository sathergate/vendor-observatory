export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-4 w-32 bg-surface rounded mb-4" />
        <div className="h-8 w-56 bg-surface rounded" />
        <div className="h-4 w-96 bg-surface rounded mt-2" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-surface rounded-[6px]" />
        ))}
      </div>
      <div className="bg-surface rounded-[6px] overflow-hidden">
        <div className="h-10 bg-raised border-b border-border" />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-12 border-b border-border-subtle" />
        ))}
      </div>
    </div>
  );
}
