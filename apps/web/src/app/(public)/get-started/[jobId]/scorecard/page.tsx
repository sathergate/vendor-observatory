"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  JobStatus,
  UrlAnalysisData,
  FastBenchmarkData,
  BalancedBenchmarkData,
  ComprehensiveBenchmarkData,
} from "@/lib/onboard";

function ScoreColor({ score }: { score: number }) {
  if (score >= 70) return <span className="text-signal-strong">{score}</span>;
  if (score >= 40) return <span className="text-data-3">{score}</span>;
  return <span className="text-signal-noise">{score}</span>;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) return <span className="text-signal-strong font-data">+{delta}%</span>;
  if (delta < 0) return <span className="text-signal-noise font-data">{delta}%</span>;
  return <span className="text-secondary font-data">0%</span>;
}

function FindingCard({ rec }: {
  rec: { title: string; priority: "P1" | "P2" | "P3"; impact: "HIGH" | "MEDIUM" | "LOW"; description: string };
}) {
  return (
    <div className="bg-base border border-border rounded-[6px] p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-[6px] font-data ${
          rec.priority === "P1"
            ? "bg-signal-noise/15 text-signal-noise"
            : rec.priority === "P2"
              ? "bg-data-3/15 text-data-3"
              : "bg-raised text-secondary"
        }`}>
          {rec.priority}
        </span>
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-[6px] font-data ${
          rec.impact === "HIGH"
            ? "bg-signal-strong/15 text-signal-strong"
            : rec.impact === "MEDIUM"
              ? "bg-data-3/15 text-data-3"
              : "bg-raised text-secondary"
        }`}>
          {rec.impact} impact
        </span>
      </div>
      <h3 className="font-medium mb-1 text-[14px] text-primary">{rec.title}</h3>
      <p className="text-[13px] text-secondary">{rec.description}</p>
    </div>
  );
}

function ConstraintBar({ rate }: { rate: number }) {
  const color = rate >= 70 ? "bg-signal-strong" : rate >= 40 ? "bg-data-3" : "bg-signal-noise";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-raised rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-[12px] text-secondary font-data w-10 text-right">{rate}%</span>
    </div>
  );
}

export default function ScorecardPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stopped = false;

    async function load() {
      try {
        const res = await fetch(`/api/onboard/analyze/${jobId}`);
        if (!res.ok) {
          setError(true);
          return;
        }
        const data: JobStatus = await res.json();
        if (data.stages.fast.status !== "complete") {
          router.replace(`/get-started/${jobId}`);
          return;
        }
        setStatus(data);
        // Keep polling until comprehensive is done
        if (data.stages.comprehensive.status === "complete") stopped = true;
      } catch {
        setError(true);
      }
    }

    load();
    const id = setInterval(() => {
      if (!stopped) load();
    }, 5000);
    return () => clearInterval(id);
  }, [jobId, router]);

  if (error) {
    return <div className="p-8 text-secondary text-[14px]">Job not found.</div>;
  }

  if (!status) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center text-secondary text-[14px]">
        Loading...
      </div>
    );
  }

  const urlData = status.stages.url_analysis.data as UrlAnalysisData;
  const fastData = status.stages.fast.data as FastBenchmarkData;
  const balancedData = status.stages.balanced.data as BalancedBenchmarkData | null;
  const compData = status.stages.comprehensive.data as ComprehensiveBenchmarkData | null;

  // Use the highest-fidelity data available: comprehensive > balanced > fast
  const mentionRate = compData?.mention_rate ?? balancedData?.mention_rate ?? fastData.mention_rate;
  const sessionsAnalyzed = compData?.sessions_analyzed ?? balancedData?.sessions_analyzed ?? fastData.sessions_analyzed;
  const platforms = compData?.platforms ?? balancedData?.platforms ?? fastData.platforms;
  const aiReadiness = compData?.ai_readiness_score ?? balancedData?.ai_readiness_score ?? null;
  const competitorComparison = compData?.competitor_comparison ?? balancedData?.competitor_comparison ?? null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary">{urlData.detected_name}</h1>
        <div className="flex items-center gap-3 mt-2">
          <span className="px-2.5 py-0.5 bg-surface border border-border rounded-[6px] text-[13px] text-secondary">
            {urlData.category}
          </span>
          <span className="text-[13px] text-muted font-data">
            {sessionsAnalyzed} sessions analyzed
          </span>
          {compData && (
            <span className="px-2 py-0.5 bg-accent/15 border border-accent/30 rounded-[6px] text-[12px] text-accent">
              Comprehensive
            </span>
          )}
        </div>
      </div>

      {/* Detection Score */}
      {aiReadiness != null && (
        <div className="bg-surface border border-border rounded-[6px] p-6 mb-6">
          <p className="section-header mb-1">Detection Score</p>
          <div className="text-5xl font-bold font-data">
            <ScoreColor score={aiReadiness} />
            <span className="text-lg text-muted font-normal ml-1">/100</span>
          </div>
          <p className="text-[13px] text-muted mt-2">
            Based on mention rate ({mentionRate}%), platform coverage,
            and mention context across {platforms.join(", ")}.
          </p>
        </div>
      )}

      {/* Fast-only summary when neither balanced nor comprehensive is ready */}
      {aiReadiness == null && (
        <div className="bg-surface border border-border rounded-[6px] p-6 mb-6">
          <p className="section-header mb-1">Mention Rate</p>
          <div className="text-5xl font-bold font-data">
            <span className="text-accent">{mentionRate}%</span>
          </div>
          <p className="text-[13px] text-muted mt-2">
            Across {sessionsAnalyzed} sessions on {platforms.join(", ")}.
            Full detection score available shortly.
          </p>
        </div>
      )}

      {/* Competitor Comparison */}
      {competitorComparison && (
        <div className="bg-surface border border-border rounded-[6px] p-6 mb-6">
          <h2 className="section-header mb-4">Competitor Comparison</h2>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-secondary border-b border-border">
                <th className="th-label text-left py-2">Vendor</th>
                <th className="th-label text-right py-2">Mention Rate</th>
                <th className="th-label text-right py-2">vs. You</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border-subtle">
                <td className="py-2.5 font-medium text-primary">
                  {urlData.detected_name}
                  <span className="ml-2 text-[11px] text-accent">you</span>
                </td>
                <td className="text-right py-2.5 font-data">{mentionRate}%</td>
                <td className="text-right py-2.5 text-muted">&mdash;</td>
              </tr>
              {competitorComparison.map((comp) => (
                <tr key={comp.name} className="border-b border-border-subtle">
                  <td className="py-2.5 text-secondary">{comp.name}</td>
                  <td className="text-right py-2.5 font-data">{comp.mention_rate}%</td>
                  <td className="text-right py-2.5">
                    <DeltaBadge delta={comp.delta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Constraint Coverage — comprehensive only */}
      {compData && compData.constraint_coverage.length > 0 && (
        <div className="bg-surface border border-border rounded-[6px] p-6 mb-6">
          <h2 className="section-header mb-4">Constraint Coverage</h2>
          <p className="text-[13px] text-secondary mb-4">
            How well AI assistants address specific technical requirements when mentioning your product.
          </p>
          <div className="space-y-3">
            {compData.constraint_coverage.map((cc) => (
              <div key={cc.constraint}>
                <p className="text-[13px] text-secondary mb-1">
                  {cc.constraint.replace(/_/g, " ")}
                </p>
                <ConstraintBar rate={cc.addressed_rate} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Findings — comprehensive: show all; balanced: show first + blur */}
      {compData && (
        <div className="bg-surface border border-border rounded-[6px] p-6 mb-8">
          <h2 className="section-header mb-4">
            {compData.all_recommendations.length} Findings
          </h2>
          <div className="space-y-4">
            {compData.all_recommendations.map((rec, i) => (
              <FindingCard key={i} rec={rec} />
            ))}
          </div>
        </div>
      )}

      {!compData && balancedData && (
        <div className="bg-surface border border-border rounded-[6px] p-6 mb-8">
          <h2 className="section-header mb-4">
            {balancedData.recommendation_count} Findings
          </h2>

          {/* First finding - shown in full */}
          <FindingCard rec={balancedData.top_recommendation} />

          {/* Blurred placeholder for remaining findings */}
          {balancedData.recommendation_count > 1 && (
            <div className="relative mt-4">
              <div className="bg-base border border-border rounded-[6px] p-4 blur-sm">
                <div className="h-3 bg-raised rounded w-3/4 mb-2" />
                <div className="h-3 bg-raised rounded w-1/2 mb-2" />
                <div className="h-3 bg-raised rounded w-2/3" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-surface border border-border rounded-[6px] px-4 py-2 text-[13px] font-medium text-secondary">
                  {balancedData.recommendation_count - 1} more finding{balancedData.recommendation_count - 1 !== 1 ? "s" : ""} — comprehensive report running
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CTA — only show paywall if comprehensive isn't done yet */}
      {!compData && (
        <a
          href={`/plans?jobId=${jobId}&email=${encodeURIComponent(status.email ?? "")}`}
          className="block w-full text-center py-3 bg-accent hover:bg-accent/90 rounded-[6px] font-medium text-[14px] transition-colors"
        >
          Unlock all findings — choose a plan &rarr;
        </a>
      )}
    </div>
  );
}
