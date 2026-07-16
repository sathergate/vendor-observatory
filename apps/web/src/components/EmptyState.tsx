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
    <div className="quiet-signal">
      <p className="text-secondary text-[14px] font-medium">{title}</p>
      {description && (
        <p className="text-muted text-[13px] mt-2 italic max-w-[280px] mx-auto">{description}</p>
      )}
      {code && (
        <code className="inline-block mt-3 bg-raised px-3 py-1.5 rounded-[6px] text-[14px] font-data text-secondary">
          {code}
        </code>
      )}
    </div>
  );
}
