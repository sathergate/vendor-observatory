const PLATFORM_DISPLAY: Record<string, { label: string; className: string }> = {
  claude_code: { label: "Claude Code", className: "bg-blue-900/50 text-blue-300" },
  codex_cli: { label: "Codex CLI", className: "bg-green-900/50 text-green-300" },
  cursor: { label: "Cursor", className: "bg-purple-900/50 text-purple-300" },
  cursor_agent: { label: "Cursor", className: "bg-purple-900/50 text-purple-300" },
};

export function PlatformBadge({
  platform,
  size = "sm",
}: {
  platform: string;
  size?: "xs" | "sm";
}) {
  const meta = PLATFORM_DISPLAY[platform] ?? {
    label: platform,
    className: "bg-gray-700 text-gray-300",
  };
  const sizeClass = size === "xs" ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-block rounded font-medium ${sizeClass} ${meta.className}`}>
      {meta.label}
    </span>
  );
}
