import Link from "next/link";
import { Breadcrumb } from "@/components/Breadcrumb";
import { StatCard } from "@/components/StatCard";
import { getRejectionSummary, getRejectionReasonBreakdown } from "@/lib/db";
import {
  loadVendorFactors,
  getVendorFactors,
  type VendorFactorData,
} from "@/lib/load-vendor-factors";
import { generateImprovements, type ImprovementSuggestion } from "@/lib/factor-improvements";
import { vendorDisplayName, VENDOR_META } from "@/lib/vendor-taxonomy";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  backlog: { label: "Backlog", color: "text-muted", bg: "bg-raised" },
  in_progress: { label: "In Progress", color: "text-data-3", bg: "bg-data-3/10" },
  shipped: { label: "Shipped", color: "text-data-1", bg: "bg-data-1/10" },
  verified: { label: "Verified", color: "text-data-5", bg: "bg-data-5/10" },
  wont_fix: { label: "Won't Fix", color: "text-muted", bg: "bg-raised" },
};

const PRIORITY_STYLES: Record<string, { border: string; bg: string; badge: string }> = {
  critical: { border: "border-l-data-4", bg: "bg-data-4/5", badge: "bg-data-4/30 text-data-4" },
  high: { border: "border-l-data-3", bg: "bg-data-3/5", badge: "bg-data-3/30 text-data-3" },
  medium: { border: "border-l-accent", bg: "bg-accent/5", badge: "bg-accent/20 text-accent" },
  low: { border: "border-l-data-muted", bg: "", badge: "bg-raised text-muted" },
};

const REASON_LABELS: Record<string, string> = {
  too_expensive: "Pricing concerns",
  too_complex: "Too complex to integrate",
  poor_docs: "Documentation gaps",
  not_available_region: "Regional availability",
  feature_gap: "Missing features",
  trust_concerns: "Trust/reliability issues",
  vendor_lock_in: "Lock-in risk",
};

export default async function RemediationIssuesPage() {
  const [rejections, factorDataset] = await Promise.all([
    getRejectionSummary(),
    Promise.resolve(loadVendorFactors()),
  ]);

  // Generate improvement suggestions for each vendor with rejections
  const vendorIssues: Array<{
    vendor: string;
    rejections: number;
    rejectionRate: number;
    topReason: string;
    topAlternative: string | null;
    improvements: ImprovementSuggestion[];
  }> = [];

  for (const rej of rejections) {
    const vendorId = rej.vendor_canonical_id;
    const factor = getVendorFactors(vendorId);
    if (!factor) continue;

    const catSummary = factorDataset.byCategory[VENDOR_META[vendorId]?.category ?? ""] ?? null;
    const improvements = generateImprovements(factor, factorDataset.factors, catSummary);

    // Find the top rejection reason
    const reasons = [
      { reason: "too_expensive", count: Number(rej.too_expensive) },
      { reason: "too_complex", count: Number(rej.too_complex) },
      { reason: "poor_docs", count: Number(rej.poor_docs) },
      { reason: "not_available_region", count: Number(rej.not_available_region) },
      { reason: "feature_gap", count: Number(rej.feature_gap) },
      { reason: "trust_concerns", count: Number(rej.trust_concerns) },
      { reason: "vendor_lock_in", count: Number(rej.vendor_lock_in) },
    ].filter((r) => r.count > 0).sort((a, b) => b.count - a.count);

    vendorIssues.push({
      vendor: vendorId,
      rejections: Number(rej.total_rejections),
      rejectionRate: rej.rejection_rate,
      topReason: reasons[0]?.reason ?? "unknown",
      topAlternative: rej.top_alternative,
      improvements: improvements.filter((i) => i.priority === "critical" || i.priority === "high"),
    });
  }

  // Also gather vendors with factor gaps but no rejections
  const rejectedVendorIds = new Set(rejections.map((r) => r.vendor_canonical_id));
  const additionalIssues: Array<{
    vendor: string;
    improvements: ImprovementSuggestion[];
  }> = [];

  for (const vendor of factorDataset.vendors) {
    if (rejectedVendorIds.has(vendor.vendorId)) continue;
    const catSummary = factorDataset.byCategory[VENDOR_META[vendor.vendorId]?.category ?? ""] ?? null;
    const improvements = generateImprovements(vendor, factorDataset.factors, catSummary);
    const critical = improvements.filter((i) => i.priority === "critical");
    if (critical.length > 0) {
      additionalIssues.push({ vendor: vendor.vendorId, improvements: critical });
    }
  }

  // Compute stats
  const totalIssues = vendorIssues.reduce((sum, v) => sum + v.improvements.length, 0)
    + additionalIssues.reduce((sum, v) => sum + v.improvements.length, 0);
  const criticalIssues = vendorIssues.reduce(
    (sum, v) => sum + v.improvements.filter((i) => i.priority === "critical").length, 0,
  ) + additionalIssues.reduce((sum, v) => sum + v.improvements.length, 0);
  const vendorsAffected = vendorIssues.length + additionalIssues.length;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <Breadcrumb items={[{ label: "Fixes" }, { label: "Remediation Issues" }]} />
          <h2 className="section-header">Remediation Issues</h2>
          <p className="text-secondary text-[13px] mt-1">
            Auto-generated from rejection patterns and factor score gaps.
            Each issue links a loss pattern to a specific factor improvement.
          </p>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2">
        {Object.entries(STATUS_STYLES).map(([key, style]) => (
          <span key={key} className={`px-3 py-1.5 rounded-[6px] text-[12px] font-medium ${style.color} ${style.bg}`}>
            {style.label}
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="TOTAL ISSUES"
          value={totalIssues.toLocaleString()}
          subtext="from rejection + factor analysis"
        />
        <StatCard
          label="CRITICAL"
          value={criticalIssues.toLocaleString()}
          subtext="low score on high-weight factors"
          valueClassName={criticalIssues > 0 ? "text-data-4" : ""}
        />
        <StatCard
          label="VENDORS AFFECTED"
          value={vendorsAffected.toLocaleString()}
          subtext="with at least one issue"
        />
        <StatCard
          label="REJECTION-LINKED"
          value={vendorIssues.length.toLocaleString()}
          subtext="issues tied to rejection clusters"
        />
      </div>

      {/* Issues from rejection patterns */}
      {vendorIssues.length > 0 && (
        <section className="space-y-4">
          <h3 className="section-header">Rejection-Linked Issues</h3>
          <p className="text-[13px] text-secondary">
            Vendors with active rejections matched to factor improvements that could reduce loss rate.
          </p>
          <div className="space-y-4">
            {vendorIssues.map((vi) => (
              <div key={vi.vendor} className="bg-surface rounded-[6px] border border-border">
                {/* Vendor header */}
                <div className="px-5 py-4 border-b border-border-subtle">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/benchmarks/vendors/${encodeURIComponent(vi.vendor)}`}
                      className="text-[14px] font-medium text-primary hover:text-accent"
                    >
                      {vendorDisplayName(vi.vendor)}
                    </Link>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] text-data-4 font-data">
                        {vi.rejections} rejection{vi.rejections !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[12px] text-muted">
                        rate: <span className="font-data">{(vi.rejectionRate * 100).toFixed(1)}%</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[12px]">
                    <span className="text-muted">
                      Top reason: <span className="text-secondary">{REASON_LABELS[vi.topReason] ?? vi.topReason}</span>
                    </span>
                    {vi.topAlternative && (
                      <span className="text-muted">
                        Losing to:{" "}
                        <Link
                          href={`/benchmarks/vendors/${encodeURIComponent(vi.topAlternative)}`}
                          className="text-accent hover:text-accent/80"
                        >
                          {vendorDisplayName(vi.topAlternative)}
                        </Link>
                      </span>
                    )}
                  </div>
                </div>

                {/* Improvement cards */}
                {vi.improvements.length > 0 ? (
                  <div className="p-4 space-y-2">
                    {vi.improvements.map((imp, i) => {
                      const ps = PRIORITY_STYLES[imp.priority] ?? PRIORITY_STYLES.low;
                      return (
                        <div key={i} className={`border-l-4 ${ps.border} ${ps.bg} rounded-r-[6px] p-3`}>
                          <div className="flex items-start gap-2">
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-[6px] ${ps.badge} shrink-0 mt-0.5 font-data`}>
                              {imp.priority.toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-primary">{imp.title}</p>
                              <p className="text-[12px] text-secondary mt-0.5">{imp.description}</p>
                              <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                                <span className="text-muted">
                                  Factor: <span className="text-secondary">{imp.factorLabel}</span>
                                </span>
                                <span className="text-muted">
                                  Score: <span className="font-data text-data-4">{imp.score}/5</span>
                                </span>
                                <span className="text-muted">
                                  Category avg: <span className="font-data text-secondary">{imp.categoryAvg}/5</span>
                                </span>
                                <span className="text-muted">
                                  Gap to best: <span className="font-data text-accent">{imp.gap}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4">
                    <p className="text-[12px] text-muted italic">
                      No factor gaps identified. Rejection may be driven by external factors.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Factor-only issues (no rejection data) */}
      {additionalIssues.length > 0 && (
        <section className="space-y-4">
          <h3 className="section-header">Factor Gap Issues</h3>
          <p className="text-[13px] text-secondary">
            Vendors with critical factor scores that haven&apos;t yet shown rejection patterns.
            These are preventive improvements.
          </p>
          <div className="space-y-3">
            {additionalIssues.map((ai) => (
              <div key={ai.vendor} className="bg-surface rounded-[6px] border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <Link
                    href={`/fixes/factors/${encodeURIComponent(ai.vendor)}`}
                    className="text-[13px] font-medium text-primary hover:text-accent"
                  >
                    {vendorDisplayName(ai.vendor)}
                  </Link>
                  <span className="text-[11px] text-muted">
                    {ai.improvements.length} critical gap{ai.improvements.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {ai.improvements.map((imp, i) => {
                    const ps = PRIORITY_STYLES[imp.priority] ?? PRIORITY_STYLES.low;
                    return (
                      <div key={i} className="flex items-center gap-2 text-[12px]">
                        <span className={`font-bold px-1 py-0.5 rounded ${ps.badge} font-data text-[10px]`}>
                          {imp.priority.toUpperCase()}
                        </span>
                        <span className="text-secondary">{imp.title}</span>
                        <span className="text-muted ml-auto">
                          {imp.factorLabel}: <span className="font-data text-data-4">{imp.score}/5</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {vendorIssues.length === 0 && additionalIssues.length === 0 && (
        <div className="quiet-signal">
          <p className="text-secondary text-[14px]">No remediation issues generated.</p>
          <p className="text-muted text-[13px] italic mt-2">
            Issues are generated from rejection clusters and factor score analysis.
            Run benchmarks to collect rejection data.
          </p>
        </div>
      )}

      {/* Workflow explanation */}
      <div className="bg-surface rounded-[6px] p-6 border border-border">
        <h3 className="section-header mb-3">Remediation Workflow</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-center">
          {[
            { step: "1", label: "Loss Detected", detail: "Rejection cluster or factor gap identified" },
            { step: "2", label: "Issue Linked", detail: "Mapped to specific factor improvement" },
            { step: "3", label: "Action Defined", detail: "Concrete fix from improvement template" },
            { step: "4", label: "Fix Shipped", detail: "Docs/SDK/product change deployed" },
            { step: "5", label: "Impact Verified", detail: "Before/after metrics compared" },
          ].map((s) => (
            <div key={s.step} className="space-y-1">
              <div className="w-8 h-8 rounded-full bg-raised border border-border flex items-center justify-center mx-auto">
                <span className="font-data text-[13px] text-primary">{s.step}</span>
              </div>
              <p className="text-[13px] font-medium text-primary">{s.label}</p>
              <p className="text-[11px] text-muted">{s.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Annotation */}
      <div className="border-l-2 border-data-muted pl-3 max-w-[480px]">
        <p className="text-[13px] text-muted italic">
          Issues are auto-generated by matching rejection reasons to the 13-factor
          AI-recommendation model. Critical = score {"\u2264"} 2 on a very-high-weight factor.
          Improvement descriptions are templated from the vendor-selection-principles document.
        </p>
      </div>
    </div>
  );
}
