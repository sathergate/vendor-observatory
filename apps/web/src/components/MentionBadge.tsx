const MENTION_COLORS: Record<string, string> = {
  installed: "bg-data-5/15 text-data-5",
  configured: "bg-data-3/15 text-data-3",
  implemented: "bg-data-1/15 text-data-1",
  recommended: "bg-accent/15 text-accent",
  compared: "bg-data-2/15 text-data-2",
  mentioned: "bg-raised text-secondary",
  rejected: "bg-data-4/15 text-data-4",
};

export function MentionBadge({ type }: { type: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-[4px] text-[12px] font-medium ${
        MENTION_COLORS[type] ?? "bg-raised text-secondary"
      }`}
    >
      {type}
    </span>
  );
}
