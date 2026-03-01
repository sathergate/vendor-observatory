/**
 * LLM-Powered Response Enrichment
 *
 * Replaces the regex-based extractResponseContext() with an optional LLM call
 * that produces higher-fidelity structured extractions including:
 * - Primary vendor with confidence score
 * - Full reasoning chain
 * - Disqualification reasons for rejected vendors
 * - Nuanced constraint coverage assessment
 *
 * Enable via ENRICHMENT_ENABLED=true env var.
 * Default model: claude-haiku-4-20250414 (~$0.75/run for full benchmark suite)
 */

import type {
  ParsedTurn,
  VendorTaxonomy,
  ExtractedResponseContext,
  VendorDispositionEntry,
  VendorDisposition,
  DisqualificationReason,
} from "./types.js";
import { loadPromptById } from "./prompt-store.js";

// ── Configuration ──────────────────────────────────────────────────

export function isEnrichmentEnabled(): boolean {
  return process.env.ENRICHMENT_ENABLED === "true";
}

export function getEnrichmentModel(): string {
  return process.env.ENRICHMENT_MODEL || "claude-haiku-4-20250414";
}

// ── LLM Extraction Schema ──────────────────────────────────────────

interface LLMExtractionResult {
  primary_vendor: string | null;
  confidence: number;
  is_implemented: boolean;
  reasoning_chain: string;
  vendors: Array<{
    vendor: string;
    disposition: "recommended" | "compared" | "rejected" | "mentioned" | "implemented";
  }>;
  disqualification_reasons: Array<{
    vendor: string;
    reason: string;
  }>;
  trade_offs: string | null;
  gotchas: string | null;
  constraints_addressed: string[];
  rationale: string | null;
}

// ── System Prompt ──────────────────────────────────────────────────

/** Pool interface for DB loading */
interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

let _cachedEnrichmentTemplate: string | null = null;

async function getEnrichmentTemplate(pool: Queryable): Promise<string> {
  if (_cachedEnrichmentTemplate) return _cachedEnrichmentTemplate;

  const row = await loadPromptById(pool, "system-enrichment");
  if (row) {
    _cachedEnrichmentTemplate = row.text;
    return row.text;
  }

  throw new Error(
    'Prompt "system-enrichment" not found in DB. Run: DATABASE_URL=... npx tsx db/seed-prompts.ts',
  );
}

function buildSystemPrompt(template: string, vendorNames: string[], constraints: string[]): string {
  return template
    .replace("{{VENDOR_NAMES}}", vendorNames.slice(0, 100).join(", "))
    .replace("{{CONSTRAINTS}}", constraints.length > 0 ? constraints.join(", ") : "none specified");
}

// ── Main LLM Extraction Function ──────────────────────────────────

/**
 * Extract structured response context using an LLM call.
 *
 * Requires ANTHROPIC_API_KEY in environment.
 * Falls back gracefully to null on any error (caller should use regex fallback).
 */
export async function extractResponseContextWithLLM(
  turns: ParsedTurn[],
  taxonomy: VendorTaxonomy,
  promptConstraints: string[],
  pool: Queryable,
): Promise<ExtractedResponseContext | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  // Concatenate all assistant text
  const assistantText = turns
    .filter((t) => t.role === "assistant" && t.textContent)
    .map((t) => t.textContent)
    .join("\n\n");

  if (!assistantText || assistantText.length < 50) {
    return null;
  }

  // Truncate very long responses to stay within token budget
  const truncated = assistantText.length > 8000
    ? assistantText.slice(0, 8000) + "\n\n[... truncated for analysis]"
    : assistantText;

  const vendorNames = taxonomy.vendors.map((v) => v.canonical_id);
  const template = await getEnrichmentTemplate(pool);
  const systemPrompt = buildSystemPrompt(template, vendorNames, promptConstraints);

  try {
    // Dynamic import to avoid requiring the SDK when enrichment is disabled
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: getEnrichmentModel(),
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Extract structured data from this AI assistant response:\n\n${truncated}`,
        },
      ],
    });

    // Extract text from response
    const responseText = response.content
      .filter((block) => block.type === "text")
      .map((block) => ("text" in block ? (block as { text: string }).text : ""))
      .join("");

    // Parse JSON — handle potential markdown code fences
    const jsonStr = responseText
      .replace(/^```(?:json)?\s*\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();

    const result: LLMExtractionResult = JSON.parse(jsonStr);

    // Validate and resolve vendor names against taxonomy
    const resolvedPrimary = result.primary_vendor
      ? resolveVendorId(result.primary_vendor, taxonomy)
      : null;

    const vendorsMentioned: VendorDispositionEntry[] = result.vendors
      .map((v) => ({
        vendor: resolveVendorId(v.vendor, taxonomy) || v.vendor,
        disposition: v.disposition as VendorDisposition,
      }))
      .filter((v) => taxonomy.vendors.some((tv) => tv.canonical_id === v.vendor));

    const disqualificationReasons: DisqualificationReason[] = result.disqualification_reasons
      .map((d) => ({
        vendor: resolveVendorId(d.vendor, taxonomy) || d.vendor,
        reason: d.reason,
      }))
      .filter((d) => taxonomy.vendors.some((tv) => tv.canonical_id === d.vendor));

    // Filter constraints to only those that exist in the prompt
    const constraintsAddressed = result.constraints_addressed
      .filter((c) => promptConstraints.includes(c));

    return {
      primaryVendor: resolvedPrimary,
      isImplemented: result.is_implemented,
      rationaleSnippet: result.rationale?.slice(0, 500) ?? null,
      vendorsMentioned,
      tradeOffsSnippet: result.trade_offs?.slice(0, 500) ?? null,
      gotchasSnippet: result.gotchas?.slice(0, 500) ?? null,
      constraintsAddressed,
      reasoningChain: result.reasoning_chain?.slice(0, 1000) ?? null,
      disqualificationReasons,
      confidenceScore: Math.max(0, Math.min(1, result.confidence)),
    };
  } catch (err) {
    // LLM extraction failed — caller should fall back to regex
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`LLM enrichment failed: ${errMsg}`);
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function resolveVendorId(raw: string, taxonomy: VendorTaxonomy): string | null {
  const lower = raw.toLowerCase().trim();
  for (const vendor of taxonomy.vendors) {
    if (vendor.canonical_id.toLowerCase() === lower) return vendor.canonical_id;
    if (vendor.display_name.toLowerCase() === lower) return vendor.canonical_id;
    for (const syn of vendor.synonyms) {
      if (syn.toLowerCase() === lower) return vendor.canonical_id;
    }
  }
  return null;
}
