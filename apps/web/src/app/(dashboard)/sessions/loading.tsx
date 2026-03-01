export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-4 w-20 bg-surface rounded mb-4" />
        <div className="h-8 w-40 bg-surface rounded" />
      </div>
      <div className="bg-surface rounded-[6px] overflow-hidden">
        <div className="h-10 bg-raised border-b border-border" />
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-12 border-b border-border-subtle" />
        ))}
      </div>
    </div>
  );
}
