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

function buildSystemPrompt(vendorNames: string[], constraints: string[]): string {
  return `You are an analyst extracting structured data from AI coding assistant responses about developer tool vendor recommendations.

You will be given the text of an AI assistant's response to a developer question. Extract the following information as JSON:

KNOWN VENDORS (canonical IDs): ${vendorNames.slice(0, 100).join(", ")}

PROMPT CONSTRAINTS to check for: ${constraints.length > 0 ? constraints.join(", ") : "none specified"}

Return ONLY valid JSON matching this schema:
{
  "primary_vendor": string | null,       // The canonical vendor ID of the PRIMARY recommendation (the vendor the AI most strongly suggests). null if no clear recommendation.
  "confidence": number,                   // 0.0-1.0 confidence in primary_vendor extraction
  "is_implemented": boolean,              // true if the response includes actual implementation code (npm install, import statements, config files, etc.)
  "reasoning_chain": string,              // 2-4 sentence summary of the logical steps the AI used to arrive at its recommendation
  "vendors": [                            // ALL vendors mentioned, with their disposition
    { "vendor": "canonical_id", "disposition": "recommended|compared|rejected|mentioned|implemented" }
  ],
  "disqualification_reasons": [           // Why specific vendors were rejected or not chosen
    { "vendor": "canonical_id", "reason": "brief explanation" }
  ],
  "trade_offs": string | null,            // Key trade-offs discussed (2-3 sentences max). null if none.
  "gotchas": string | null,               // Warnings, pitfalls, gotchas mentioned (2-3 sentences max). null if none.
  "constraints_addressed": string[],      // Which prompt constraints were genuinely ADDRESSED (not just mentioned) in the response
  "rationale": string | null              // The AI's stated reason for its primary recommendation (1-2 sentences). null if no clear rationale.
}

Rules:
- Use ONLY canonical vendor IDs from the KNOWN VENDORS list. If a vendor is mentioned but not in the list, skip it.
- For constraints_addressed, only include constraints that were genuinely ADDRESSED (the response explains how the vendor handles it), not merely MENTIONED in passing.
- "disposition" meanings: "recommended" = explicitly suggested as the solution, "compared" = discussed as an alternative, "rejected" = explicitly advised against, "mentioned" = named but not evaluated, "implemented" = code/config was written for it
- confidence should be high (>0.8) when there's an explicit "I recommend X" or clear primary choice, medium (0.4-0.8) when the recommendation is implicit, low (<0.4) when it's ambiguous
- Keep reasoning_chain, trade_offs, gotchas, and rationale concise — focus on substance, not verbosity`;
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
  const systemPrompt = buildSystemPrompt(vendorNames, promptConstraints);

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
