import type {
  VendorTaxonomy,
  ParsedTurn,
  VendorDisposition,
  VendorDispositionEntry,
  ExtractedResponseContext,
} from "./types.js";

// ── Recommendation Phrases ──────────────────────────────────────────

const PRIMARY_RECOMMENDATION_PATTERNS = [
  /(?:I\s+(?:recommend|suggest)|my\s+(?:recommendation|top\s+pick)|the\s+best\s+(?:option|choice|fit)\s+(?:is|would\s+be)|I['']d\s+(?:go\s+with|choose|pick)|let['']s?\s+(?:go\s+with|use))\s+\**([A-Z][a-zA-Z0-9\s.-]{1,40})\**/i,
  /\*\*(?:Recommendation|Primary\s+choice|Winner|Top\s+pick|My\s+pick)[:\s]*\*?\*?\s*\**([A-Z][a-zA-Z0-9\s.-]{1,40})\**/i,
  /(?:go\s+with|choose|pick|use|start\s+with)\s+\**([A-Z][a-zA-Z0-9\s.-]{1,40})\**\s+(?:as\s+your|for\s+(?:this|your|the))/i,
];

const TRADE_OFF_SECTION_PATTERNS = [
  /(?:trade[- ]?offs?|pros?\s+(?:and|&|\/)\s+cons?|advantages?\s+(?:and|&|\/)\s+disadvantages?|considerations?|caveats?)[:\s]*\n([\s\S]{10,500}?)(?:\n(?:#{1,3}\s|---|\*\*[A-Z])|\n\n\n)/i,
  /(?:however|on\s+the\s+other\s+hand|the\s+(?:downside|trade[- ]?off))[,:\s]+([\s\S]{10,300}?)(?:\.\s|\n\n)/i,
];

const GOTCHA_SECTION_PATTERNS = [
  /(?:gotchas?|watch\s+out|be\s+(?:aware|careful)|important\s+(?:notes?|caveats?)|pitfalls?|known\s+(?:issues?|limitations?))[:\s]*\n([\s\S]{10,500}?)(?:\n(?:#{1,3}\s|---|\*\*[A-Z])|\n\n\n)/i,
  /(?:⚠️|🚨|⚡|Warning|Note)[:\s]+([\s\S]{10,200}?)(?:\n\n)/i,
];

const RATIONALE_PATTERNS = [
  /(?:(?:I\s+(?:recommend|suggest)|(?:here['']?s?\s+)?why|the\s+reason)[:\s]+)([\s\S]{10,300}?)(?:\.\s*\n|\n\n)/i,
  /(?:(?:This|It)\s+(?:is\s+(?:ideal|perfect|great|the\s+best)|works?\s+(?:well|best))\s+(?:because|since|for))[:\s]*([\s\S]{10,200}?)(?:\.\s*\n|\n\n)/i,
];

// ── Disposition Patterns ────────────────────────────────────────────

const REJECTION_CONTEXT = [
  /(?:(?:I\s+)?(?:wouldn['']t|would\s+not|don['']t|do\s+not)\s+recommend|avoid|stay\s+away\s+from|not\s+(?:a\s+good|the\s+best)\s+(?:choice|option|fit)|(?:downside|drawback|limitation)s?\s+of|overkill|too\s+(?:heavy|complex|expensive))/i,
];

const COMPARISON_CONTEXT = [
  /(?:compared?\s+to|versus|vs\.?|alternatively|another\s+option|instead\s+of|if\s+you\s+(?:need|want|prefer))/i,
];

const RECOMMENDATION_CONTEXT = [
  /(?:I\s+(?:recommend|suggest)|you\s+(?:should|could)\s+use|(?:great|good|excellent|best|ideal)\s+(?:choice|option|fit)|let['']s?\s+use|we(?:['']ll)?\s+use)/i,
];

const IMPLEMENTATION_MARKERS = [
  /(?:npm\s+install|pnpm\s+add|yarn\s+add|pip\s+install)\s/,
  /(?:import\s+.*from\s+['"]|require\s*\(\s*['"])/,
  /(?:\.env|process\.env\.|DATABASE_URL|NEXT_PUBLIC_)/,
  /```(?:typescript|javascript|ts|js|python|py|bash|sh)/,
];

// ── Main Extraction Function ────────────────────────────────────────

/**
 * Extract structured response context from a benchmark session's assistant turns.
 *
 * This is a heuristic-based extractor (no LLM call) that:
 * 1. Identifies the primary recommended vendor
 * 2. Determines if the response includes implementation (code/config)
 * 3. Extracts rationale, trade-offs, and gotchas
 * 4. Classifies each mentioned vendor's disposition
 * 5. Checks which constraints from the prompt were addressed
 */
export function extractResponseContext(
  turns: ParsedTurn[],
  taxonomy: VendorTaxonomy,
  promptConstraints: string[],
): ExtractedResponseContext {
  // Concatenate all assistant text
  const assistantText = turns
    .filter((t) => t.role === "assistant" && t.textContent)
    .map((t) => t.textContent)
    .join("\n\n");

  if (!assistantText || assistantText.length < 20) {
    return emptyContext();
  }

  // 1. Find primary recommendation
  let primaryVendor = extractPrimaryVendor(assistantText, taxonomy);

  // 2. Check for implementation
  const isImplemented = IMPLEMENTATION_MARKERS.some((p) => p.test(assistantText));

  // 2b. Detect Custom/DIY: agent implemented code but no vendor was recommended
  const isCustomDiy = isImplemented && primaryVendor === null;

  // 3. Extract rationale snippet
  const rationaleSnippet = extractFirstMatch(assistantText, RATIONALE_PATTERNS);

  // 4. Extract vendor dispositions
  const vendorsMentioned = extractVendorDispositions(assistantText, taxonomy, primaryVendor);

  // 5. Extract trade-offs
  const tradeOffsSnippet = extractFirstMatch(assistantText, TRADE_OFF_SECTION_PATTERNS);

  // 6. Extract gotchas
  const gotchasSnippet = extractFirstMatch(assistantText, GOTCHA_SECTION_PATTERNS);

  // 7. Check constraint coverage
  const constraintsAddressed = checkConstraintCoverage(assistantText, promptConstraints);

  // When Custom/DIY detected, set primary_vendor to the pseudo-vendor
  if (isCustomDiy) {
    primaryVendor = "custom-diy";
  }

  return {
    primaryVendor,
    isImplemented,
    isCustomDiy,
    rationaleSnippet: rationaleSnippet?.slice(0, 500) ?? null,
    vendorsMentioned,
    tradeOffsSnippet: tradeOffsSnippet?.slice(0, 500) ?? null,
    gotchasSnippet: gotchasSnippet?.slice(0, 500) ?? null,
    constraintsAddressed,
    // Regex extractor doesn't produce these — LLM enrichment fills them
    reasoningChain: null,
    disqualificationReasons: [],
    confidenceScore: null,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function emptyContext(): ExtractedResponseContext {
  return {
    primaryVendor: null,
    isImplemented: false,
    isCustomDiy: false,
    rationaleSnippet: null,
    vendorsMentioned: [],
    tradeOffsSnippet: null,
    gotchasSnippet: null,
    constraintsAddressed: [],
    reasoningChain: null,
    disqualificationReasons: [],
    confidenceScore: null,
  };
}

/**
 * Try to find the primary recommended vendor using recommendation-pattern matching
 * and then resolving the captured name against the taxonomy.
 */
function extractPrimaryVendor(text: string, taxonomy: VendorTaxonomy): string | null {
  for (const pattern of PRIMARY_RECOMMENDATION_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const resolved = resolveToTaxonomy(match[1].trim(), taxonomy);
      if (resolved) return resolved;
    }
  }

  // Fallback: find the first vendor mentioned after a recommendation phrase
  for (const recPattern of RECOMMENDATION_CONTEXT) {
    const recMatch = recPattern.exec(text);
    if (recMatch) {
      // Look in the next 200 chars after the recommendation phrase
      const afterRec = text.slice(recMatch.index, recMatch.index + 200);
      for (const vendor of taxonomy.vendors) {
        const terms = [vendor.display_name, ...vendor.synonyms].filter((t) => t.length >= 3);
        for (const term of terms) {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          if (new RegExp(`\\b${escaped}\\b`, "i").test(afterRec)) {
            return vendor.canonical_id;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Resolve a raw name to a canonical vendor ID from the taxonomy.
 */
function resolveToTaxonomy(raw: string, taxonomy: VendorTaxonomy): string | null {
  const cleaned = raw.replace(/\*+/g, "").trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();

  for (const vendor of taxonomy.vendors) {
    if (vendor.canonical_id.toLowerCase() === lower) return vendor.canonical_id;
    if (vendor.display_name.toLowerCase() === lower) return vendor.canonical_id;
    for (const syn of vendor.synonyms) {
      if (syn.toLowerCase() === lower) return vendor.canonical_id;
    }
  }

  // Partial match: if the raw text starts with or contains a vendor name
  for (const vendor of taxonomy.vendors) {
    if (lower.includes(vendor.canonical_id.toLowerCase())) return vendor.canonical_id;
    if (lower.includes(vendor.display_name.toLowerCase())) return vendor.canonical_id;
  }

  return null;
}

/**
 * Classify each mentioned vendor's disposition (recommended, compared, rejected, mentioned, implemented).
 */
function extractVendorDispositions(
  text: string,
  taxonomy: VendorTaxonomy,
  primaryVendor: string | null,
): VendorDispositionEntry[] {
  const results: VendorDispositionEntry[] = [];
  const seen = new Set<string>();

  for (const vendor of taxonomy.vendors) {
    const terms = [vendor.display_name, ...vendor.synonyms].filter((t) => t.length >= 3);
    let matched = false;

    for (const term of terms) {
      if (matched) break;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      const match = regex.exec(text);

      if (!match) continue;
      if (seen.has(vendor.canonical_id)) break;
      seen.add(vendor.canonical_id);
      matched = true;

      // Get surrounding context for disposition
      const startIdx = Math.max(0, match.index - 150);
      const endIdx = Math.min(text.length, match.index + term.length + 150);
      const context = text.slice(startIdx, endIdx);

      let disposition: VendorDisposition = "mentioned";

      if (vendor.canonical_id === primaryVendor) {
        disposition = "recommended";
      } else if (REJECTION_CONTEXT.some((p) => p.test(context))) {
        disposition = "rejected";
      } else if (COMPARISON_CONTEXT.some((p) => p.test(context))) {
        disposition = "compared";
      } else if (RECOMMENDATION_CONTEXT.some((p) => p.test(context))) {
        disposition = "recommended";
      }

      // Check if this vendor was actually implemented (code/config written for it)
      if (disposition === "recommended" || disposition === "mentioned") {
        const vendorSpecificImpl = text.match(
          new RegExp(`(?:npm\\s+install|pnpm\\s+add|yarn\\s+add).*\\b${escaped}\\b`, "i"),
        );
        if (vendorSpecificImpl) {
          disposition = "implemented";
        }
      }

      results.push({ vendor: vendor.canonical_id, disposition });
    }
  }

  return results;
}

/**
 * Check which of the prompt's stated constraints were addressed in the response.
 */
function checkConstraintCoverage(text: string, constraints: string[]): string[] {
  const addressed: string[] = [];
  const lower = text.toLowerCase();

  // Map common constraint IDs to text patterns that would indicate coverage
  const constraintPatterns: Record<string, RegExp[]> = {
    serverless_compatible: [/serverless/i, /connection\s+pool/i, /http\s+driver/i, /edge\s+(?:runtime|function)/i],
    pgvector_required: [/pgvector/i, /vector\s+(?:search|index|column|embedding)/i],
    eu_data_residency: [/eu\s+(?:region|data|residency)/i, /gdpr/i, /europe/i, /frankfurt|ireland|london/i],
    pitr_backups: [/pitr/i, /point[- ]in[- ]time/i, /backup/i, /restore/i],
    soc2: [/soc\s*2/i, /soc\s*ii/i, /compliance/i],
    hipaa: [/hipaa/i, /health\s+(?:data|information)/i],
    gdpr: [/gdpr/i, /data\s+(?:protection|privacy|residency)/i],
    rls: [/row[- ]level\s+security/i, /\brls\b/i],
    branching: [/branch/i, /preview\s+(?:env|deploy)/i, /per[- ]pr/i],
    real_time: [/real[- ]?time/i, /websocket/i, /subscription/i, /live\s+(?:update|query)/i],
    edge_compatible: [/edge/i, /cloudflare\s+worker/i, /vercel\s+edge/i],
    type_safe: [/type[- ]?safe/i, /typescript/i, /typed\s+(?:client|sdk|api)/i],
    offline_support: [/offline/i, /local[- ]first/i, /sync/i],
    multi_tenant: [/multi[- ]?tenant/i, /tenant\s+(?:isolation|separation)/i],
    audit_log: [/audit\s+log/i, /audit\s+trail/i],
    encryption_at_rest: [/encrypt(?:ion|ed)\s+at\s+rest/i, /aes/i, /kms/i],
    zero_downtime_migration: [/zero[- ]downtime/i, /rolling\s+migration/i, /blue[- ]green/i],
    read_replicas: [/read\s+replica/i, /replica/i],
    autoscaling: [/auto[- ]?scal/i, /scale\s+to\s+zero/i],
    connection_pooling: [/connection\s+pool/i, /pgbouncer/i, /pooler/i],
  };

  for (const constraint of constraints) {
    const patterns = constraintPatterns[constraint];
    if (patterns) {
      if (patterns.some((p) => p.test(lower))) {
        addressed.push(constraint);
      }
    } else {
      // Fallback: check if the constraint term appears in the text (snake_case → space)
      const terms = constraint.split("_").join(" ");
      if (lower.includes(terms.toLowerCase())) {
        addressed.push(constraint);
      }
    }
  }

  return addressed;
}

/**
 * Extract the first matching snippet from a list of patterns.
 */
function extractFirstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}
