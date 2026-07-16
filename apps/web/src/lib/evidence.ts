/**
 * Evidence linking contract — every recommendation/fix must reference
 * at least one session or benchmark case as proof.
 */

export interface EvidenceRef {
  type: "session" | "benchmark_case";
  id: string;
  label: string;
  url: string;
  anchor?: string;
}

export function buildSessionEvidenceRef(
  sessionId: string,
  label: string,
  anchor?: string,
): EvidenceRef {
  const url = `/sessions/${encodeURIComponent(sessionId)}${anchor ? `#${anchor}` : ""}`;
  return { type: "session", id: sessionId, label, url, anchor };
}

export function buildBenchmarkEvidenceRef(
  caseId: string,
  label: string,
): EvidenceRef {
  const url = `/evidence/transcripts?case=${encodeURIComponent(caseId)}`;
  return { type: "benchmark_case", id: caseId, label, url };
}

export function buildEvidenceUrl(ref: EvidenceRef): string {
  return ref.url;
}

/**
 * Validate that a list of evidence refs meets the minimum requirement.
 * Returns true if at least `min` refs are present.
 */
export function hasMinimumEvidence(
  refs: EvidenceRef[] | undefined,
  min: number = 1,
): boolean {
  return (refs?.length ?? 0) >= min;
}
