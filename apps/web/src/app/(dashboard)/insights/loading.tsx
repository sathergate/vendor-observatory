export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-8 w-56 bg-gray-800 rounded" />
        <div className="h-4 w-96 bg-gray-800 rounded mt-2" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-800 rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-gray-800 rounded-lg" />
      <div className="h-48 bg-gray-800 rounded-lg" />
    </div>
  );
}
