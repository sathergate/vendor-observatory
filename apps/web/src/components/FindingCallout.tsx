import type { AgentSplitRow } from "@/lib/db";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";

export function FindingCallout({
  finding,
  variant = "default",
}: {
  finding: string;
  variant?: "default" | "split" | "consensus";
}) {
  const icon =
    variant === "split" ? "⇄" : variant === "consensus" ? "≡" : "→";
  const borderColor =
    variant === "split"
      ? "border-data-3"
      : variant === "consensus"
        ? "border-data-1"
        : "border-border";

  return (
    <div
      className={`border-l-2 ${borderColor} pl-3 py-2 max-w-[480px]`}
    >
      <p className="text-[13px] text-secondary italic">
        <span className="not-italic mr-1">{icon}</span>
        {finding}
      </p>
    </div>
  );
}

/**
 * Generate narrative callout strings from agent split data.
 * Returns at most `limit` findings, prioritizing the most interesting.
 */
export function generateFindings(
  splits: AgentSplitRow[],
  limit = 3,
): Array<{ text: string; variant: "split" | "consensus" }> {
  const findings: Array<{ text: string; variant: "split" | "consensus"; priority: number }> = [];

  // Count vendor wins per platform
  const platformVendorCounts = new Map<string, Map<string, number>>();
  for (const split of splits) {
    for (const [platform, vendor] of Object.entries(split.platforms)) {
      if (!platformVendorCounts.has(platform)) platformVendorCounts.set(platform, new Map());
      const counts = platformVendorCounts.get(platform)!;
      counts.set(vendor, (counts.get(vendor) ?? 0) + 1);
    }
  }

  // Find agent-split picks (same category, different vendor)
  const splitPicks = splits.filter((s) => !s.is_consensus);
  const consensusPicks = splits.filter((s) => s.is_consensus);

  // Group split picks by category to find category-level disagreements
  const splitsByCategory = new Map<string, AgentSplitRow[]>();
  for (const s of splitPicks) {
    if (!splitsByCategory.has(s.category)) splitsByCategory.set(s.category, []);
    splitsByCategory.get(s.category)!.push(s);
  }

  // Generate split findings
  for (const [category, categorySplits] of splitsByCategory) {
    if (categorySplits.length < 1) continue;
    const platforms = Object.keys(categorySplits[0].platforms);
    if (platforms.length < 2) continue;

    // Find the most common vendor per platform in this category
    const platformTopVendor: Record<string, { vendor: string; count: number }> = {};
    for (const platform of platforms) {
      const vendorCounts = new Map<string, number>();
      for (const s of categorySplits) {
        const v = s.platforms[platform];
        if (v) vendorCounts.set(v, (vendorCounts.get(v) ?? 0) + 1);
      }
      const sorted = [...vendorCounts.entries()].sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        platformTopVendor[platform] = { vendor: sorted[0][0], count: sorted[0][1] };
      }
    }

    const platformEntries = Object.entries(platformTopVendor);
    if (platformEntries.length >= 2) {
      const [p1, d1] = platformEntries[0];
      const [p2, d2] = platformEntries[1];
      if (d1.vendor !== d2.vendor) {
        const pct1 = Math.round((d1.count / categorySplits.length) * 100);
        const pct2 = Math.round((d2.count / categorySplits.length) * 100);
        const platformLabel = (p: string) =>
          p === "claude_code" ? "Claude" : p === "codex_cli" ? "Codex" : "Cursor";
        findings.push({
          text: `${categoryDisplayName(category)} split: ${platformLabel(p1)} favors ${vendorDisplayName(d1.vendor)} (${pct1}%), ${platformLabel(p2)} favors ${vendorDisplayName(d2.vendor)} (${pct2}%).`,
          variant: "split",
          priority: categorySplits.length,
        });
      }
    }
  }

  // Find strongest cross-agent consensus signal
  if (consensusPicks.length > 0) {
    const vendorConsensusCounts = new Map<string, number>();
    for (const c of consensusPicks) {
      const vendor = Object.values(c.platforms)[0];
      vendorConsensusCounts.set(vendor, (vendorConsensusCounts.get(vendor) ?? 0) + 1);
    }
    const sorted = [...vendorConsensusCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [topVendor, count] = sorted[0];
      const pct = Math.round((count / splits.length) * 100);
      findings.push({
        text: `${vendorDisplayName(topVendor)} is the strongest cross-agent consensus signal, agreed upon in ${pct}% of multi-platform prompts.`,
        variant: "consensus",
        priority: count,
      });
    }
  }

  // Sort by priority (most data-backed first)
  findings.sort((a, b) => b.priority - a.priority);
  return findings.slice(0, limit).map(({ text, variant }) => ({ text, variant }));
}

function categoryDisplayName(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
