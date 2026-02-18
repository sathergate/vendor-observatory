/**
 * Developer Intent Classification (Rule-Based)
 *
 * Classifies developer prompts by the kind of help they're seeking.
 * Uses keyword pattern matching consistent with the project's regex-first design.
 *
 * Phase 1: Rule-based classifier
 * Phase 2: Piggyback on LLM enrichment call (future)
 */

import type { DeveloperIntent, IntentClassification } from "./types.js";

// ── Intent Pattern Definitions ─────────────────────────────────────

interface IntentRule {
  intent: DeveloperIntent;
  /** High-confidence patterns — strong signal for this intent */
  strong: RegExp[];
  /** Medium-confidence patterns — suggestive but may overlap */
  weak: RegExp[];
  /** Sub-intent extractor (optional) */
  subIntentPatterns?: Array<{ pattern: RegExp; subIntent: string }>;
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: "evaluation",
    strong: [
      /\b(?:compare|comparison|versus|vs\.?)\b.*\b(?:and|or|to)\b/i,
      /\bwhich\s+(?:is|one\s+(?:is|should))\s+(?:better|best|faster|cheaper|more\s+\w+)/i,
      /\b(?:pros?\s+(?:and|&|\/)\s+cons?)\b/i,
      /\b(?:evaluate|benchmark|assess)\b.*\b(?:vendor|tool|service|solution|option)/i,
      /\b(?:head[- ]to[- ]head|shootout|bake[- ]?off)\b/i,
    ],
    weak: [
      /\b(?:what\s+(?:are|is)\s+the\s+(?:difference|tradeoff)s?\s+between)\b/i,
      /\b(?:should\s+I\s+(?:use|pick|choose|go\s+with))\b/i,
      /\b(?:recommend|suggestion)\b/i,
      /\b(?:better|worse|faster|slower|cheaper|more\s+expensive)\s+than\b/i,
    ],
    subIntentPatterns: [
      { pattern: /\b(?:database|db|postgres|mysql|mongo)/i, subIntent: "database_evaluation" },
      { pattern: /\b(?:auth|authentication|identity)/i, subIntent: "auth_evaluation" },
      { pattern: /\b(?:hosting|deploy|infra)/i, subIntent: "hosting_evaluation" },
    ],
  },
  {
    intent: "migration",
    strong: [
      /\b(?:migrat(?:e|ing|ion))\s+(?:from|away\s+from|off\s+of)/i,
      /\b(?:switch|transition|move)\s+(?:from|away\s+from)/i,
      /\b(?:replac(?:e|ing))\s+\w+\s+with\b/i,
      /\b(?:off[- ]?board|sunset|deprecat(?:e|ing))\b/i,
    ],
    weak: [
      /\bfrom\s+\w+\s+to\s+\w+\b/i,
      /\b(?:instead\s+of|alternative\s+to)\b/i,
      /\b(?:upgrade|downgrade)\s+(?:from|to)\b/i,
    ],
    subIntentPatterns: [
      { pattern: /\b(?:database|db|postgres|mysql|mongo|supabase|firebase)/i, subIntent: "database_migration" },
      { pattern: /\b(?:auth|authentication|clerk|auth0)/i, subIntent: "auth_migration" },
    ],
  },
  {
    intent: "greenfield",
    strong: [
      /\b(?:set\s+up|setup|start|build|create)\s+(?:a\s+)?(?:new|fresh)\b/i,
      /\b(?:from\s+scratch|brand\s+new|greenfield)\b/i,
      /\b(?:bootstrap|scaffold|init(?:ialize)?)\s+(?:a\s+)?(?:new|project|app)/i,
      /\b(?:starting\s+a\s+new|building\s+(?:a|my)\s+(?:first|new))\b/i,
    ],
    weak: [
      /\b(?:best\s+(?:stack|setup|way\s+to\s+start))\b/i,
      /\b(?:what\s+(?:should|do)\s+I\s+(?:use|pick)\s+for\s+(?:a|my)\s+new)\b/i,
      /\b(?:how\s+(?:to|do\s+I)\s+(?:set\s+up|start|build))\b/i,
    ],
    subIntentPatterns: [
      { pattern: /\b(?:saas|web\s+app|full[- ]?stack)/i, subIntent: "saas_setup" },
      { pattern: /\b(?:api|backend|server)/i, subIntent: "api_setup" },
      { pattern: /\b(?:mobile|react\s+native|flutter)/i, subIntent: "mobile_setup" },
    ],
  },
  {
    intent: "debugging",
    strong: [
      /\b(?:fix|debug|troubleshoot|resolve)\b.*\b(?:error|issue|bug|problem|crash)/i,
      /\b(?:error|exception|failure|crash|timeout)[:\s]+/i,
      /\b(?:not\s+working|doesn['']t\s+work|broke(?:n)?|failing)\b/i,
      /\b(?:stack\s+trace|traceback|segfault|panic)\b/i,
    ],
    weak: [
      /\b(?:why\s+(?:is|does|am\s+I\s+getting))\b/i,
      /\b(?:help\s+(?:me\s+)?(?:fix|debug|understand))\b/i,
      /\b(?:getting\s+(?:an?\s+)?(?:error|exception|warning))\b/i,
      /\b(?:can['']t|cannot|unable\s+to)\b/i,
    ],
    subIntentPatterns: [
      { pattern: /\b(?:connection|connect|pool|timeout)/i, subIntent: "connection_debugging" },
      { pattern: /\b(?:deploy|build|ci|cd)/i, subIntent: "deployment_debugging" },
      { pattern: /\b(?:type|typescript|ts)/i, subIntent: "type_debugging" },
    ],
  },
  {
    intent: "architecture",
    strong: [
      /\b(?:best\s+practic(?:e|es)|recommended\s+(?:approach|pattern|architecture))\b/i,
      /\b(?:how\s+should\s+I\s+(?:structure|architect|design|organize))\b/i,
      /\b(?:architecture|design\s+pattern|system\s+design)\b/i,
      /\b(?:scalab(?:le|ility)|maintain(?:able|ability)|production[- ]ready)\b/i,
    ],
    weak: [
      /\b(?:what['']s\s+the\s+(?:right|correct|proper)\s+way)\b/i,
      /\b(?:pattern|approach|strategy)\s+for\b/i,
      /\b(?:how\s+(?:to|do\s+(?:you|I))\s+(?:handle|manage|implement))\b/i,
    ],
    subIntentPatterns: [
      { pattern: /\b(?:multi[- ]?tenant|tenant)/i, subIntent: "multi_tenancy" },
      { pattern: /\b(?:micro[- ]?service|distributed)/i, subIntent: "microservices" },
      { pattern: /\b(?:real[- ]?time|websocket|event[- ]driven)/i, subIntent: "realtime_architecture" },
    ],
  },
  {
    intent: "compliance",
    strong: [
      /\b(?:SOC\s*2|SOC\s*II|SOC2)\b/i,
      /\b(?:HIPAA|HITECH)\b/i,
      /\b(?:GDPR|CCPA|CPRA)\b/i,
      /\b(?:PCI[- ]?DSS)\b/i,
      /\b(?:FedRAMP|ITAR|CMMC)\b/i,
      /\b(?:data\s+(?:residency|sovereignty|locality))\b/i,
    ],
    weak: [
      /\b(?:complian(?:t|ce)|regulat(?:ory|ion))\b/i,
      /\b(?:audit(?:\s+log|\s+trail)?|encryption\s+at\s+rest)\b/i,
      /\b(?:eu\s+(?:region|data|hosting)|european\s+(?:data|hosting))\b/i,
    ],
    subIntentPatterns: [
      { pattern: /\b(?:health|medical|patient)/i, subIntent: "healthcare_compliance" },
      { pattern: /\b(?:financ|banking|payment)/i, subIntent: "financial_compliance" },
      { pattern: /\b(?:eu|europe|gdpr|data\s+residen)/i, subIntent: "eu_compliance" },
    ],
  },
  {
    intent: "cost_optimization",
    strong: [
      /\b(?:cheap(?:er|est)|low(?:er)?[- ]cost|budget|affordable|free\s+tier)\b/i,
      /\b(?:reduce|lower|minimize|cut)\s+(?:cost|spending|bill|expense)/i,
      /\b(?:cost[- ](?:effective|efficient|optimize|saving))\b/i,
      /\b(?:pricing|price\s+comparison|how\s+much\s+does)\b/i,
    ],
    weak: [
      /\b(?:free|open[- ]?source|self[- ]?host)\b/i,
      /\b(?:pay[- ](?:as|per)[- ](?:you[- ]go|use))\b/i,
      /\b(?:scale\s+to\s+zero|serverless)\b.*\b(?:cost|price|bill)/i,
    ],
    subIntentPatterns: [
      { pattern: /\b(?:database|db|hosting)/i, subIntent: "database_cost" },
      { pattern: /\b(?:startup|side\s+project|hobby)/i, subIntent: "startup_cost" },
    ],
  },
];

// ── Main Classification Function ──────────────────────────────────

/**
 * Classify a developer prompt's intent using rule-based pattern matching.
 *
 * Returns the top-scoring intent with confidence and optional sub-intent.
 */
export function classifyIntent(promptText: string): IntentClassification {
  if (!promptText || promptText.length < 10) {
    return { intent: "unknown", confidence: 0, subIntent: null, classifier: "rule" };
  }

  const scores: Array<{ intent: DeveloperIntent; score: number; subIntent: string | null }> = [];

  for (const rule of INTENT_RULES) {
    let score = 0;

    // Strong patterns: +2 each
    for (const pattern of rule.strong) {
      if (pattern.test(promptText)) {
        score += 2;
      }
    }

    // Weak patterns: +1 each
    for (const pattern of rule.weak) {
      if (pattern.test(promptText)) {
        score += 1;
      }
    }

    if (score > 0) {
      // Find sub-intent
      let subIntent: string | null = null;
      if (rule.subIntentPatterns) {
        for (const sp of rule.subIntentPatterns) {
          if (sp.pattern.test(promptText)) {
            subIntent = sp.subIntent;
            break;
          }
        }
      }

      scores.push({ intent: rule.intent, score, subIntent });
    }
  }

  if (scores.length === 0) {
    return { intent: "unknown", confidence: 0, subIntent: null, classifier: "rule" };
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  const top = scores[0];
  const maxPossibleScore = 10; // rough max (5 strong × 2 + generous)

  // Confidence: normalize score and penalize if close to second-place
  let confidence = Math.min(1, top.score / maxPossibleScore);
  if (scores.length > 1) {
    const gap = top.score - scores[1].score;
    if (gap === 0) {
      confidence *= 0.5; // Ambiguous — two intents tied
    } else if (gap === 1) {
      confidence *= 0.75; // Close call
    }
  }

  // Minimum confidence floor for any matched intent
  confidence = Math.max(0.2, confidence);

  return {
    intent: top.intent,
    confidence: Math.round(confidence * 100) / 100,
    subIntent: top.subIntent,
    classifier: "rule",
  };
}

/**
 * Classify multiple prompts and return results.
 * Useful for batch processing during ingest.
 */
export function classifyIntents(
  prompts: Array<{ promptId: string; text: string }>,
): Array<{ promptId: string; classification: IntentClassification }> {
  return prompts.map((p) => ({
    promptId: p.promptId,
    classification: classifyIntent(p.text),
  }));
}
