/**
 * Feature flags — env-based, all default OFF.
 *
 * Set FLAG_<NAME>=true in .env.local or deployment environment to enable.
 * Server components read these directly; client components receive them
 * via props from server parents.
 */
export const FLAGS = {
  /** IA v2 shell: Home / Performance / Reasons / Fixes / Evidence / Lab */
  IA_V2: process.env.FLAG_IA_V2 === "true",

  /** Vendor detail page v2: actions-first layout */
  VENDOR_SURFACE_V2: process.env.FLAG_VENDOR_SURFACE_V2 === "true",

  /** Benchmark vs organic data source separation */
  DATA_SOURCE_SPLIT: process.env.FLAG_DATA_SOURCE_SPLIT === "true",

  /** Agent Legibility Signals replacing AI-readiness grades */
  AGENT_LEGIBILITY: process.env.FLAG_AGENT_LEGIBILITY === "true",

  /** Mandatory evidence links on all recommendations */
  EVIDENCE_LINKS: process.env.FLAG_EVIDENCE_LINKS === "true",

  /** Loss→remediation workflow with issue tracking */
  REMEDIATION: process.env.FLAG_REMEDIATION === "true",

  /** Onboarding diagnosis before payment */
  ONBOARDING_DIAGNOSIS: process.env.FLAG_ONBOARDING_DIAGNOSIS === "true",

  /** Enhanced Reasons + Evidence core flows */
  REASONS_EVIDENCE: process.env.FLAG_REASONS_EVIDENCE === "true",

  /** Docs/SDK remediation generator */
  DOCS_REMEDIATION: process.env.FLAG_DOCS_REMEDIATION === "true",

  /** Lab area with query builder + saved analyses */
  LAB: process.env.FLAG_LAB === "true",

  /** Landing page A/B test + instrumentation */
  LANDING_AB: process.env.FLAG_LANDING_AB === "true",
} as const;

export type FlagName = keyof typeof FLAGS;
