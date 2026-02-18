export function EmptyState({
  title,
  description,
  code,
}: {
  title: string;
  description?: string;
  code?: string;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-8 text-center">
      <p className="text-gray-300 text-lg font-medium">{title}</p>
      {description && (
        <p className="text-gray-500 text-sm mt-2">{description}</p>
      )}
      {code && (
        <code className="inline-block mt-3 bg-gray-700 px-3 py-1.5 rounded text-sm text-gray-300">
          {code}
        </code>
      )}
    </div>
  );
}
