/**
 * Post-Benchmark Agentic Digest
 *
 * Pipeline: snapshot → delta detection → significance scoring →
 *           LLM narrative generation → alert emission
 */

import type { ObservatoryDB } from "./db.js";

// ── Types ──────────────────────────────────────────────────────────

export interface VendorDelta {
  promptId: string;
  platform: string;
  previousVendor: string | null;
  currentVendor: string | null;
  changeType: "new_entry" | "vendor_change" | "vendor_exit";
  category?: string;
}

export interface ScoredDelta extends VendorDelta {
  significanceScore: number;
}

export interface DigestAlert {
  alertType: "win_rate_drop" | "multi_prompt_loss" | "new_top_3" | "vendor_exit";
  vendor: string;
  severity: "high" | "medium" | "low";
  message: string;
  data: Record<string, unknown>;
}

// ── Helpers ────────────────────────────────────────────────────────

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

// ── Snapshot ────────────────────────────────────────────────────────

export function createSnapshot(db: ObservatoryDB, date: string): number {
  const allContexts = db.getAllResponseContexts();

  let count = 0;
  for (const ctx of allContexts) {
    const constraintsAddressed = safeJsonParse<string[]>(ctx.constraints_addressed, []);
    db.upsertSnapshot(
      date,
      ctx.prompt_id,
      ctx.source_platform,
      ctx.primary_vendor,
      constraintsAddressed,
    );
    count++;
  }

  return count;
}

// ── Delta Detection ────────────────────────────────────────────────

export function detectDeltas(db: ObservatoryDB, currentDate: string): VendorDelta[] {
  const prevDate = db.getPreviousSnapshotDate(currentDate);
  if (!prevDate) return [];

  const currentSnapshot = db.getSnapshot(currentDate);
  const previousSnapshot = db.getSnapshot(prevDate);

  // Build lookup maps
  const prevMap = new Map<string, string | null>();
  for (const entry of previousSnapshot) {
    prevMap.set(`${entry.prompt_id}|${entry.platform}`, entry.primary_vendor);
  }

  const deltas: VendorDelta[] = [];

  for (const entry of currentSnapshot) {
    const key = `${entry.prompt_id}|${entry.platform}`;
    const prevVendor = prevMap.get(key);

    if (prevVendor === undefined) {
      // New entry
      if (entry.primary_vendor) {
        deltas.push({
          promptId: entry.prompt_id,
          platform: entry.platform,
          previousVendor: null,
          currentVendor: entry.primary_vendor,
          changeType: "new_entry",
        });
      }
    } else if (prevVendor !== entry.primary_vendor) {
      // Vendor changed
      deltas.push({
        promptId: entry.prompt_id,
        platform: entry.platform,
        previousVendor: prevVendor,
        currentVendor: entry.primary_vendor,
        changeType: entry.primary_vendor ? "vendor_change" : "vendor_exit",
      });
    }
  }

  return deltas;
}

// ── Significance Scoring ───────────────────────────────────────────

const CATEGORY_IMPORTANCE: Record<string, number> = {
  database: 1.0,
  auth: 0.9,
  hosting: 0.85,
  payments: 0.8,
  storage: 0.75,
  monitoring: 0.7,
  email: 0.65,
  search: 0.6,
  analytics: 0.55,
};

export function scoreSignificance(deltas: VendorDelta[]): ScoredDelta[] {
  if (deltas.length === 0) return [];

  // Track cross-platform consistency
  const vendorDeltaCount = new Map<string, number>();
  for (const d of deltas) {
    const vendor = d.currentVendor || d.previousVendor || "";
    vendorDeltaCount.set(vendor, (vendorDeltaCount.get(vendor) || 0) + 1);
  }

  return deltas.map((d) => {
    const catImportance = CATEGORY_IMPORTANCE[d.category || ""] || 0.5;
    const vendor = d.currentVendor || d.previousVendor || "";
    const crossPlatformConsistency = Math.min(1, (vendorDeltaCount.get(vendor) || 1) / 2);

    // Change type weight
    const changeWeight = d.changeType === "vendor_change" ? 1.0 : d.changeType === "vendor_exit" ? 0.8 : 0.5;

    const significanceScore = catImportance * crossPlatformConsistency * changeWeight;

    return { ...d, significanceScore };
  }).sort((a, b) => b.significanceScore - a.significanceScore);
}

// ── Narrative Generation ───────────────────────────────────────────

export async function generateNarrative(
  significantChanges: ScoredDelta[],
): Promise<string | null> {
  if (significantChanges.length === 0) {
    return "No significant vendor position changes detected in this benchmark run.";
  }

  // Try LLM narrative if API key is available
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey });

      const changesText = significantChanges
        .slice(0, 10)
        .map((c) =>
          `- ${c.promptId} (${c.platform}): ${c.previousVendor || "none"} → ${c.currentVendor || "none"} [${c.changeType}, score=${c.significanceScore.toFixed(2)}]`,
        )
        .join("\n");

      const response = await client.messages.create({
        model: process.env.ENRICHMENT_MODEL || "claude-haiku-4-20250414",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `You are writing a brief daily digest for a developer tool vendor observatory. Summarize these vendor position changes in 3-5 sentences. Focus on the most impactful changes and what they might signal about market dynamics. Be concise and data-driven.\n\nChanges:\n${changesText}`,
          },
        ],
      });

      const text = response.content
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { type: string }) => ("text" in b ? (b as { text: string }).text : ""))
        .join("");

      return text.trim() || null;
    } catch {
      // Fall through to template
    }
  }

  // Template fallback
  const vendorChanges = new Map<string, { gains: number; losses: number }>();
  for (const c of significantChanges) {
    if (c.currentVendor) {
      const entry = vendorChanges.get(c.currentVendor) || { gains: 0, losses: 0 };
      entry.gains++;
      vendorChanges.set(c.currentVendor, entry);
    }
    if (c.previousVendor) {
      const entry = vendorChanges.get(c.previousVendor) || { gains: 0, losses: 0 };
      entry.losses++;
      vendorChanges.set(c.previousVendor, entry);
    }
  }

  const lines: string[] = [];
  lines.push(`${significantChanges.length} significant vendor position change(s) detected.`);
  for (const [vendor, data] of vendorChanges.entries()) {
    if (data.gains > data.losses) {
      lines.push(`${vendor}: gaining ground (+${data.gains - data.losses} net prompts).`);
    } else if (data.losses > data.gains) {
      lines.push(`${vendor}: losing ground (-${data.losses - data.gains} net prompts).`);
    }
  }

  return lines.join(" ");
}

// ── Alert Emission ─────────────────────────────────────────────────

export function emitAlerts(deltas: VendorDelta[]): DigestAlert[] {
  const alerts: DigestAlert[] = [];

  // Count losses per vendor
  const lossCount = new Map<string, number>();
  for (const d of deltas) {
    if (d.previousVendor && d.changeType !== "new_entry") {
      lossCount.set(d.previousVendor, (lossCount.get(d.previousVendor) || 0) + 1);
    }
  }

  // Alert: vendor losing 3+ prompts
  for (const [vendor, losses] of lossCount.entries()) {
    if (losses >= 3) {
      alerts.push({
        alertType: "multi_prompt_loss",
        vendor,
        severity: losses >= 5 ? "high" : "medium",
        message: `${vendor} lost ${losses} prompt(s) in this run`,
        data: { losses },
      });
    }
  }

  // Count gains per vendor
  const gainCount = new Map<string, number>();
  for (const d of deltas) {
    if (d.currentVendor && (d.changeType === "new_entry" || d.changeType === "vendor_change")) {
      gainCount.set(d.currentVendor, (gainCount.get(d.currentVendor) || 0) + 1);
    }
  }

  // Alert: new vendor entering top 3
  for (const [vendor, gains] of gainCount.entries()) {
    if (gains >= 3 && !lossCount.has(vendor)) {
      alerts.push({
        alertType: "new_top_3",
        vendor,
        severity: "medium",
        message: `${vendor} gained ${gains} new prompt win(s) — potential newcomer`,
        data: { gains },
      });
    }
  }

  return alerts;
}
