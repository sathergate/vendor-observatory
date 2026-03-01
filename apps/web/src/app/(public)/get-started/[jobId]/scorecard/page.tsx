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
  if (score >= 70) return <span className="text-green-400">{score}</span>;
  if (score >= 40) return <span className="text-yellow-400">{score}</span>;
  return <span className="text-red-400">{score}</span>;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) return <span className="text-green-400">+{delta}%</span>;
  if (delta < 0) return <span className="text-red-400">{delta}%</span>;
  return <span className="text-gray-400">0%</span>;
}

function RecommendationCard({ rec }: {
  rec: { title: string; priority: "P1" | "P2" | "P3"; impact: "HIGH" | "MEDIUM" | "LOW"; description: string };
}) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
          rec.priority === "P1"
            ? "bg-red-900/50 text-red-300"
            : rec.priority === "P2"
              ? "bg-yellow-900/50 text-yellow-300"
              : "bg-gray-700 text-gray-300"
        }`}>
          {rec.priority}
        </span>
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
          rec.impact === "HIGH"
            ? "bg-green-900/50 text-green-300"
            : rec.impact === "MEDIUM"
              ? "bg-yellow-900/50 text-yellow-300"
              : "bg-gray-700 text-gray-300"
        }`}>
          {rec.impact} impact
        </span>
      </div>
      <h3 className="font-medium mb-1">{rec.title}</h3>
      <p className="text-sm text-gray-400">{rec.description}</p>
    </div>
  );
}

function ConstraintBar({ rate }: { rate: number }) {
  const color = rate >= 70 ? "bg-green-500" : rate >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-10 text-right">{rate}%</span>
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
    return <div className="p-8 text-gray-400">Job not found.</div>;
  }

  if (!status) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center text-gray-400">
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
        <h1 className="text-3xl font-bold">{urlData.detected_name}</h1>
        <div className="flex items-center gap-3 mt-2">
          <span className="px-2.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300">
            {urlData.category}
          </span>
          <span className="text-sm text-gray-500">
            {sessionsAnalyzed} sessions analyzed
          </span>
          {compData && (
            <span className="px-2 py-0.5 bg-blue-900/50 border border-blue-700/50 rounded text-xs text-blue-300">
              Comprehensive
            </span>
          )}
        </div>
      </div>

      {/* AI Readiness Score */}
      {aiReadiness != null && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <p className="text-sm text-gray-400 mb-1">AI Readiness Score</p>
          <div className="text-5xl font-bold">
            <ScoreColor score={aiReadiness} />
            <span className="text-lg text-gray-500 font-normal ml-1">/100</span>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Based on mention rate ({mentionRate}%), platform coverage,
            and recommendation context across {platforms.join(", ")}.
          </p>
        </div>
      )}

      {/* Fast-only summary when neither balanced nor comprehensive is ready */}
      {aiReadiness == null && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <p className="text-sm text-gray-400 mb-1">Mention Rate</p>
          <div className="text-5xl font-bold">
            <span className="text-blue-400">{mentionRate}%</span>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Across {sessionsAnalyzed} sessions on {platforms.join(", ")}.
            Full AI Readiness Score available shortly.
          </p>
        </div>
      )}

      {/* Competitor Comparison */}
      {competitorComparison && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Competitor Comparison</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 font-medium">Vendor</th>
                <th className="text-right py-2 font-medium">Mention Rate</th>
                <th className="text-right py-2 font-medium">vs. You</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-700/50">
                <td className="py-2.5 font-medium">
                  {urlData.detected_name}
                  <span className="ml-2 text-xs text-blue-400">you</span>
                </td>
                <td className="text-right py-2.5">{mentionRate}%</td>
                <td className="text-right py-2.5 text-gray-500">&mdash;</td>
              </tr>
              {competitorComparison.map((comp) => (
                <tr key={comp.name} className="border-b border-gray-700/50">
                  <td className="py-2.5">{comp.name}</td>
                  <td className="text-right py-2.5">{comp.mention_rate}%</td>
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
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Constraint Coverage</h2>
          <p className="text-sm text-gray-400 mb-4">
            How well AI assistants address specific technical requirements when recommending your product.
          </p>
          <div className="space-y-3">
            {compData.constraint_coverage.map((cc) => (
              <div key={cc.constraint}>
                <p className="text-sm text-gray-300 mb-1">
                  {cc.constraint.replace(/_/g, " ")}
                </p>
                <ConstraintBar rate={cc.addressed_rate} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations — comprehensive: show all; balanced: show top + blur */}
      {compData && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">
            {compData.all_recommendations.length} Recommendations
          </h2>
          <div className="space-y-4">
            {compData.all_recommendations.map((rec, i) => (
              <RecommendationCard key={i} rec={rec} />
            ))}
          </div>
        </div>
      )}

      {!compData && balancedData && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">
            {balancedData.recommendation_count} Recommendations
          </h2>

          {/* Top recommendation - shown in full */}
          <RecommendationCard rec={balancedData.top_recommendation} />

          {/* Blurred placeholder for remaining recommendations */}
          {balancedData.recommendation_count > 1 && (
            <div className="relative mt-4">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 blur-sm">
                <div className="h-3 bg-gray-700 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-700 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-700 rounded w-2/3" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm font-medium text-gray-300">
                  {balancedData.recommendation_count - 1} more recommendation{balancedData.recommendation_count - 1 !== 1 ? "s" : ""} — comprehensive report running
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
          className="block w-full text-center py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
        >
          Unlock all recommendations — choose a plan &rarr;
        </a>
      )}
    </div>
  );
}
