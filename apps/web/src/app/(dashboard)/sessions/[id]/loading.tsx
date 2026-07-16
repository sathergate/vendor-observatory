export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-4 w-32 bg-surface rounded mb-4" />
        <div className="h-8 w-64 bg-surface rounded" />
        <div className="h-4 w-48 bg-surface rounded mt-2" />
      </div>
      <div className="bg-surface rounded-[6px] overflow-hidden">
        <div className="h-10 bg-raised border-b border-border" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 border-b border-border-subtle" />
        ))}
      </div>
      <div className="bg-surface rounded-[6px] overflow-hidden">
        <div className="h-10 bg-raised border-b border-border" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 border-b border-border-subtle" />
        ))}
      </div>
    </div>
  );
}
