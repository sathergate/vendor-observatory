import type { EvidenceRef } from "@sathergate/vendor-observatory-shared";

// ── Types ────────────────────────────────────────────────────────────

export interface DocsPatch {
  id: string;
  vendorId: string;
  title: string;
  category: DocsPatchCategory;
  rationale: string;
  proposedPatch: string;
  evidenceRefs: EvidenceRef[];
  estimatedImpact: {
    metric: string;
    direction: "increase" | "decrease";
    confidence: "high" | "medium" | "low";
  };
}

export type DocsPatchCategory =
  | "install_path"
  | "env_var_docs"
  | "quickstart"
  | "examples"
  | "troubleshooting"
  | "api_reference"
  | "migration_guide";

export interface CompetitorDocGap {
  vendorId: string;
  competitorId: string;
  rubric: DocRubricItem[];
  overallGap: number;
  scenariosAffected: number;
}

export interface DocRubricItem {
  dimension: string;
  vendorScore: number;
  competitorScore: number;
  gap: number;
  detail: string;
}

// ── Heuristic Generator ─────────────────────────────────────────────

interface LossSignal {
  vendorId: string;
  reason: string;
  detail: string | null;
  sessionId: string | null;
  competitorId: string | null;
}

export function generateDocsPatches(
  vendorId: string,
  losses: LossSignal[],
  implementationRate: number,
): DocsPatch[] {
  const patches: DocsPatch[] = [];
  let idCounter = 0;

  const makeId = () => `patch_${vendorId}_${++idCounter}`;

  // Detect poor_docs rejections
  const docRejections = losses.filter((l) => l.reason === "poor_docs");
  if (docRejections.length > 0) {
    patches.push({
      id: makeId(),
      vendorId,
      title: "Improve documentation clarity",
      category: "quickstart",
      rationale: `${docRejections.length} rejection(s) cited poor documentation as the reason for choosing an alternative.`,
      proposedPatch: [
        "## Suggested improvements",
        "",
        "1. Add a clear quickstart guide that works in < 5 minutes",
        "2. Include copy-pasteable code snippets for common use cases",
        "3. Add environment variable documentation with examples",
        "4. Include troubleshooting section for common errors",
      ].join("\n"),
      evidenceRefs: docRejections
        .filter((l) => l.sessionId)
        .slice(0, 3)
        .map((l) => ({
          type: "session" as const,
          id: l.sessionId!,
          label: `Session ${l.sessionId!.slice(0, 8)}`,
          url: `/sessions/${encodeURIComponent(l.sessionId!)}`,
        })),
      estimatedImpact: {
        metric: "rejection_rate_poor_docs",
        direction: "decrease",
        confidence: docRejections.length >= 3 ? "high" : "medium",
      },
    });
  }

  // Detect too_complex rejections → suggest simpler install path
  const complexRejections = losses.filter((l) => l.reason === "too_complex");
  if (complexRejections.length > 0) {
    patches.push({
      id: makeId(),
      vendorId,
      title: "Simplify installation path",
      category: "install_path",
      rationale: `${complexRejections.length} rejection(s) cited complexity. AI assistants may be unable to generate correct setup code.`,
      proposedPatch: [
        "## Suggested improvements",
        "",
        "1. Provide a single-command install (npx/npm init)",
        "2. Reduce required configuration to minimum viable setup",
        "3. Add framework-specific guides (Next.js, Express, etc.)",
        "4. Provide .env.example with all required variables",
      ].join("\n"),
      evidenceRefs: complexRejections
        .filter((l) => l.sessionId)
        .slice(0, 3)
        .map((l) => ({
          type: "session" as const,
          id: l.sessionId!,
          label: `Session ${l.sessionId!.slice(0, 8)}`,
          url: `/sessions/${encodeURIComponent(l.sessionId!)}`,
        })),
      estimatedImpact: {
        metric: "implementation_conversion",
        direction: "increase",
        confidence: complexRejections.length >= 3 ? "high" : "medium",
      },
    });
  }

  // Low implementation rate → SDK needs AI-friendly docs
  if (implementationRate < 0.5 && losses.length > 0) {
    patches.push({
      id: makeId(),
      vendorId,
      title: "Add AI-friendly SDK documentation",
      category: "api_reference",
      rationale: `Implementation rate is ${Math.round(implementationRate * 100)}%. AI assistants recommend this vendor but fail to write working setup code.`,
      proposedPatch: [
        "## Suggested improvements",
        "",
        "1. Add TypeScript type definitions with JSDoc comments",
        "2. Include complete working examples (not fragments)",
        "3. Document error codes and their resolutions",
        "4. Add a 'Getting Started with AI Assistants' guide",
      ].join("\n"),
      evidenceRefs: losses
        .filter((l) => l.sessionId)
        .slice(0, 3)
        .map((l) => ({
          type: "session" as const,
          id: l.sessionId!,
          label: `Session ${l.sessionId!.slice(0, 8)}`,
          url: `/sessions/${encodeURIComponent(l.sessionId!)}`,
        })),
      estimatedImpact: {
        metric: "implementation_conversion",
        direction: "increase",
        confidence: "medium",
      },
    });
  }

  return patches;
}

// ── Competitor Doc Gap Analysis ──────────────────────────────────────

export function analyzeCompetitorDocGap(
  vendorId: string,
  competitorId: string,
  vendorLosses: number,
  competitorWins: number,
): CompetitorDocGap {
  const rubric: DocRubricItem[] = [
    {
      dimension: "Install docs clarity",
      vendorScore: 0.5,
      competitorScore: 0.8,
      gap: 0.3,
      detail: "Assessment requires documentation analysis",
    },
    {
      dimension: "Examples coverage",
      vendorScore: 0.4,
      competitorScore: 0.7,
      gap: 0.3,
      detail: "Assessment requires documentation analysis",
    },
    {
      dimension: "Troubleshooting",
      vendorScore: 0.3,
      competitorScore: 0.6,
      gap: 0.3,
      detail: "Assessment requires documentation analysis",
    },
    {
      dimension: "Platform constraints",
      vendorScore: 0.5,
      competitorScore: 0.7,
      gap: 0.2,
      detail: "Assessment requires documentation analysis",
    },
  ];

  const overallGap = rubric.reduce((sum, r) => sum + r.gap, 0) / rubric.length;

  return {
    vendorId,
    competitorId,
    rubric,
    overallGap,
    scenariosAffected: competitorWins,
  };
}
