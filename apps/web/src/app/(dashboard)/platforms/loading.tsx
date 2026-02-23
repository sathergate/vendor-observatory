export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-4 w-20 bg-gray-800 rounded mb-4" />
        <div className="h-8 w-56 bg-gray-800 rounded" />
        <div className="h-4 w-80 bg-gray-800 rounded mt-2" />
      </div>
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="h-10 bg-gray-700 border-b border-gray-700" />
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-12 border-b border-gray-700/50" />
        ))}
      </div>
    </div>
  );
}
