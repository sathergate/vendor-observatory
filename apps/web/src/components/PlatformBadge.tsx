const PLATFORM_DISPLAY: Record<string, { label: string; className: string }> = {
  claude_code: { label: "Claude Code", className: "bg-data-1/15 text-data-1" },
  codex_cli: { label: "Codex CLI", className: "bg-data-2/15 text-data-2" },
  cursor: { label: "Cursor", className: "bg-data-3/15 text-data-3" },
  cursor_agent: { label: "Cursor", className: "bg-data-3/15 text-data-3" },
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
    className: "bg-raised text-secondary",
  };
  const sizeClass = size === "xs" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[12px]";
  return (
    <span className={`inline-block rounded-[4px] font-medium ${sizeClass} ${meta.className}`}>
      {meta.label}
    </span>
  );
}
