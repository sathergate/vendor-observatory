const MENTION_COLORS: Record<string, string> = {
  installed: "bg-green-900 text-green-300",
  configured: "bg-yellow-900 text-yellow-300",
  implemented: "bg-purple-900 text-purple-300",
  recommended: "bg-blue-900 text-blue-300",
  compared: "bg-cyan-900 text-cyan-300",
  mentioned: "bg-gray-700 text-gray-300",
  rejected: "bg-red-900 text-red-300",
};

export function MentionBadge({ type }: { type: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${
        MENTION_COLORS[type] ?? "bg-gray-700 text-gray-300"
      }`}
    >
      {type}
    </span>
  );
}
