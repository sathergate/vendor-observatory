import type {
  VendorTaxonomy,
  ParsedTurn,
  RejectionReason,
  VendorRejection,
} from "./types.js";

// ── Rejection Reason Patterns ────────────────────────────────────────
// Each pattern maps contextual phrases to a RejectionReason enum value.

const REASON_PATTERNS: Array<{ reason: RejectionReason; patterns: RegExp[] }> = [
  {
    reason: "too_expensive",
    patterns: [
      /(?:too\s+expensive|cost(?:s?\s+too\s+much|ly|s?\s+a\s+lot)|pric(?:ing|e)\s+(?:is\s+)?(?:too\s+)?(?:high|steep|prohibitive)|over[- ]?priced|budget|free\s+tier\s+(?:is\s+)?(?:limited|too\s+small|insufficient|restrictive)|billing\s+(?:surprise|shock))/i,
    ],
  },
  {
    reason: "too_complex",
    patterns: [
      /(?:too\s+complex|overly\s+complex|overkill|too\s+(?:heavy|much|complicated)|steep\s+learning\s+curve|complex(?:ity)?\s+(?:is\s+)?(?:high|unnecessary)|heavyweight|over[- ]?engineered|more\s+than\s+you\s+need)/i,
    ],
  },
  {
    reason: "poor_docs",
    patterns: [
      /(?:poor\s+doc(?:s|umentation)|doc(?:s|umentation)\s+(?:is\s+)?(?:lacking|sparse|outdated|poor|incomplete|confusing)|not\s+well[- ]documented|limited\s+doc(?:s|umentation)|hard\s+to\s+find.*doc)/i,
    ],
  },
  {
    reason: "not_available_region",
    patterns: [
      /(?:not\s+available\s+in|no\s+(?:eu|us|asia|region)|(?:eu|us|region)\s+(?:data\s+)?(?:residency|availability)\s+(?:is\s+)?(?:not|lack)|geo(?:graphic)?\s+(?:restriction|limitation)|only\s+available\s+in)/i,
    ],
  },
  {
    reason: "feature_gap",
    patterns: [
      /(?:(?:doesn't|does\s+not|lack(?:s|ing)?|missing)\s+(?:support|have|offer|provide|include)|no\s+support\s+for|feature\s+gap|(?:doesn't|does\s+not)\s+(?:yet\s+)?(?:support|handle))/i,
    ],
  },
  {
    reason: "trust_concerns",
    patterns: [
      /(?:(?:trust|reliability|stability)\s+(?:concern|issue|problem)|(?:not\s+)?(?:mature|battle[- ]tested|production[- ]ready)|relatively\s+new|still\s+(?:young|new|early)|unproven|uncertain\s+future|might\s+(?:shut\s+down|disappear))/i,
    ],
  },
  {
    reason: "vendor_lock_in",
    patterns: [
      /(?:vendor\s+lock[- ]?in|lock(?:ed)?[- ]?in|proprietary|not\s+(?:standard|portable|open)|migration\s+(?:difficulty|risk|pain)|hard\s+to\s+(?:migrate|switch|move)\s+(?:away|off|from))/i,
    ],
  },
];

// ── Rejection Context Patterns ──────────────────────────────────────
// Phrases that indicate a vendor is being explicitly rejected or advised against.

const REJECTION_INDICATORS = [
  /(?:(?:I\s+)?(?:wouldn['']t|would\s+not|don['']t|do\s+not)\s+recommend)/i,
  /(?:avoid(?:ing)?|stay\s+away\s+from)/i,
  /(?:not\s+(?:a\s+good|the\s+best|ideal|the\s+right)\s+(?:choice|option|fit))/i,
  /(?:(?:downside|drawback|limitation|disadvantage)s?\s+(?:of|with|include))/i,
  /(?:(?:instead|rather)\s+(?:of|than)\s+(?:using\s+)?)/i,
  /(?:(?:better|prefer)\s+(?:to\s+use|alternative|option)\s+(?:is|would\s+be))/i,
  /(?:(?:moved|switching|migrated?)\s+(?:away\s+)?from)/i,
  /(?:(?:overkill|too\s+(?:heavy|complex|expensive))\s+for)/i,
];

// ── Alternative Recommendation Patterns ──────────────────────────────

const ALTERNATIVE_PATTERNS = [
  /(?:instead[,.]?\s+(?:I\s+)?(?:recommend|suggest|use|try|go\s+with))\s+\**([A-Z][a-zA-Z0-9\s.-]{1,40})\**/i,
  /(?:(?:better|prefer(?:red)?)\s+(?:alternative|option|choice)\s+(?:is|would\s+be))\s+\**([A-Z][a-zA-Z0-9\s.-]{1,40})\**/i,
  /(?:(?:switch|migrate|move)\s+to)\s+\**([A-Z][a-zA-Z0-9\s.-]{1,40})\**/i,
  /(?:(?:use|try|go\s+with)\s+\**([A-Z][a-zA-Z0-9\s.-]{1,40})\**\s+instead)/i,
];

// ── Main Extraction Function ────────────────────────────────────────

/**
 * Extract structured vendor rejection data from assistant turns.
 *
 * Analyzes text for patterns where a vendor is explicitly rejected,
 * identifies the reason for rejection, extracts a detail snippet,
 * and identifies the chosen alternative if mentioned.
 */
export function extractVendorRejections(
  turns: ParsedTurn[],
  taxonomy: VendorTaxonomy,
): VendorRejection[] {
  const rejections: VendorRejection[] = [];
  const seen = new Set<string>(); // "vendorId:reason" dedup

  for (const turn of turns) {
    if (turn.role !== "assistant" || !turn.textContent) continue;

    const text = turn.textContent;

    for (const vendor of taxonomy.vendors) {
      const terms = [vendor.display_name, ...vendor.synonyms].filter(t => t.length >= 3);

      for (const term of terms) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "i");
        const match = regex.exec(text);

        if (!match) continue;

        // Get surrounding context (±300 chars)
        const startIdx = Math.max(0, match.index - 300);
        const endIdx = Math.min(text.length, match.index + term.length + 300);
        const context = text.slice(startIdx, endIdx);

        // Check if this context indicates a rejection
        const isRejection = REJECTION_INDICATORS.some(p => p.test(context));
        if (!isRejection) continue;

        // Determine the rejection reason
        const reason = classifyRejectionReason(context);
        if (!reason) continue;

        const dedupKey = `${vendor.canonical_id}:${reason}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        // Extract a concise detail snippet around the rejection
        const detail = extractDetailSnippet(context, vendor.display_name);

        // Try to find the chosen alternative
        const alternative = findChosenAlternative(context, taxonomy, vendor.canonical_id);

        rejections.push({
          vendorCanonicalId: vendor.canonical_id,
          rejectionReason: reason,
          rejectionReasonDetail: detail,
          chosenAlternative: alternative,
          timestamp: turn.timestamp,
        });

        break; // Only match each vendor once per term set
      }
    }
  }

  return rejections;
}

// ── Helpers ─────────────────────────────────────────────────────────

function classifyRejectionReason(context: string): RejectionReason | null {
  for (const { reason, patterns } of REASON_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(context)) return reason;
    }
  }
  // If we detected rejection indicators but can't classify the reason,
  // default to feature_gap as the most common catch-all
  return "feature_gap";
}

function extractDetailSnippet(context: string, vendorName: string): string | null {
  // Try to extract 1-2 sentences around the vendor mention
  const sentences = context.split(/(?<=[.!?])\s+/);
  const relevant = sentences.filter(
    s => s.toLowerCase().includes(vendorName.toLowerCase()) ||
         REJECTION_INDICATORS.some(p => p.test(s))
  );

  if (relevant.length > 0) {
    return relevant.slice(0, 2).join(" ").trim().slice(0, 300);
  }

  return context.trim().slice(0, 200);
}

function findChosenAlternative(
  context: string,
  taxonomy: VendorTaxonomy,
  rejectedVendorId: string,
): string | null {
  // First check explicit alternative patterns
  for (const pattern of ALTERNATIVE_PATTERNS) {
    const match = pattern.exec(context);
    if (match?.[1]) {
      const resolved = resolveToTaxonomy(match[1].trim(), taxonomy);
      if (resolved && resolved !== rejectedVendorId) return resolved;
    }
  }

  // Fallback: find other vendor mentions after the rejection phrase
  // that are framed positively
  const positivePatterns = [
    /(?:recommend|suggest|use|go\s+with|try|prefer|better)/i,
  ];

  for (const vendor of taxonomy.vendors) {
    if (vendor.canonical_id === rejectedVendorId) continue;

    const terms = [vendor.display_name, ...vendor.synonyms].filter(t => t.length >= 3);
    for (const term of terms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      const match = regex.exec(context);
      if (!match) continue;

      // Check if this vendor appears in a positive context
      const nearContext = context.slice(
        Math.max(0, match.index - 80),
        Math.min(context.length, match.index + term.length + 80),
      );
      if (positivePatterns.some(p => p.test(nearContext))) {
        return vendor.canonical_id;
      }
    }
  }

  return null;
}

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

  for (const vendor of taxonomy.vendors) {
    if (lower.includes(vendor.canonical_id.toLowerCase())) return vendor.canonical_id;
    if (lower.includes(vendor.display_name.toLowerCase())) return vendor.canonical_id;
  }

  return null;
}
