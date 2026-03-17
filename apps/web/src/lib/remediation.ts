import type { EvidenceRef } from "@obs/shared";

// ── Types ────────────────────────────────────────────────────────────

export type RemediationStatus = "backlog" | "in_progress" | "shipped" | "verified" | "wont_fix";

export interface RemediationIssue {
  id: string;
  vendorId: string;
  title: string;
  reasonCluster: string | null;
  stableHash: string;
  ownerTeam: string | null;
  assignee: string | null;
  status: RemediationStatus;
  impactEstimate: ImpactEstimate | null;
  evidenceRefs: EvidenceRef[];
  createdAt: string;
  shippedAt: string | null;
  verifiedAt: string | null;
}

export interface ImpactEstimate {
  metric: string;
  currentValue: number;
  projectedValue: number;
  confidence: "high" | "medium" | "low";
}

export interface RemediationSnapshot {
  id: string;
  issueId: string;
  snapshotType: "before" | "after";
  recommendationShare: number | null;
  implementationConversion: number | null;
  timeToRemediationDays: number | null;
  rawData: Record<string, unknown>;
  createdAt: string;
}

// ── DB Schema SQL ────────────────────────────────────────────────────

export const REMEDIATION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS remediation_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id TEXT NOT NULL,
  title TEXT NOT NULL,
  reason_cluster TEXT,
  stable_hash TEXT UNIQUE,
  owner_team TEXT,
  assignee TEXT,
  status TEXT DEFAULT 'backlog' CHECK (status IN ('backlog','in_progress','shipped','verified','wont_fix')),
  impact_estimate JSONB,
  evidence_refs JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  shipped_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS remediation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES remediation_issues(id) ON DELETE CASCADE,
  snapshot_type TEXT CHECK (snapshot_type IN ('before','after')),
  recommendation_share NUMERIC,
  implementation_conversion NUMERIC,
  time_to_remediation_days NUMERIC,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remediation_vendor ON remediation_issues(vendor_id);
CREATE INDEX IF NOT EXISTS idx_remediation_status ON remediation_issues(status);
CREATE INDEX IF NOT EXISTS idx_remediation_snapshots_issue ON remediation_snapshots(issue_id);
`;

// ── Stable Hash ──────────────────────────────────────────────────────

export function computeStableHash(vendorId: string, reasonCluster: string): string {
  // Simple deterministic hash for deduplication
  const input = `${vendorId}:${reasonCluster}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `rem_${Math.abs(hash).toString(36)}`;
}

// ── Issue Generator ──────────────────────────────────────────────────

export interface RejectionCluster {
  vendorId: string;
  reason: string;
  count: number;
  topAlternative: string | null;
  sessionIds: string[];
}

export function generateRemediationIssues(
  clusters: RejectionCluster[],
): Omit<RemediationIssue, "id" | "createdAt">[] {
  return clusters
    .filter((c) => c.count >= 2) // Only generate for clusters with enough evidence
    .map((cluster) => ({
      vendorId: cluster.vendorId,
      title: buildIssueTitle(cluster),
      reasonCluster: cluster.reason,
      stableHash: computeStableHash(cluster.vendorId, cluster.reason),
      ownerTeam: null,
      assignee: null,
      status: "backlog" as RemediationStatus,
      impactEstimate: {
        metric: "rejection_rate",
        currentValue: cluster.count,
        projectedValue: Math.max(0, cluster.count - Math.ceil(cluster.count * 0.5)),
        confidence: cluster.count >= 5 ? "high" : cluster.count >= 3 ? "medium" : "low",
      },
      evidenceRefs: cluster.sessionIds.slice(0, 5).map((sid) => ({
        type: "session" as const,
        id: sid,
        label: `Session ${sid.slice(0, 8)}`,
        url: `/sessions/${encodeURIComponent(sid)}`,
      })),
      shippedAt: null,
      verifiedAt: null,
    }));
}

function buildIssueTitle(cluster: RejectionCluster): string {
  const reasonLabels: Record<string, string> = {
    too_expensive: "Address pricing concerns",
    too_complex: "Simplify setup/integration",
    poor_docs: "Improve documentation",
    not_available_region: "Expand regional availability",
    feature_gap: "Close feature gap",
    trust_concerns: "Build trust signals",
    vendor_lock_in: "Reduce lock-in perception",
  };
  const base = reasonLabels[cluster.reason] || `Address ${cluster.reason.replace(/_/g, " ")}`;
  return `${base} (${cluster.count} rejections)`;
}

// ── Status Transitions ───────────────────────────────────────────────

const VALID_TRANSITIONS: Record<RemediationStatus, RemediationStatus[]> = {
  backlog: ["in_progress", "wont_fix"],
  in_progress: ["shipped", "backlog", "wont_fix"],
  shipped: ["verified", "in_progress"],
  verified: [],
  wont_fix: ["backlog"],
};

export function canTransition(from: RemediationStatus, to: RemediationStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
