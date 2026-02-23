"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  JobStatus,
  UrlAnalysisData,
  FastBenchmarkData,
  BalancedBenchmarkData,
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

export default function ScorecardPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
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
      } catch {
        setError(true);
      }
    }
    load();
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

  // Use balanced data if available, otherwise fall back to fast data for display
  const mentionRate = balancedData?.mention_rate ?? fastData.mention_rate;
  const sessionsAnalyzed = balancedData?.sessions_analyzed ?? fastData.sessions_analyzed;
  const platforms = balancedData?.platforms ?? fastData.platforms;

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
        </div>
      </div>

      {/* AI Readiness Score */}
      {balancedData && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <p className="text-sm text-gray-400 mb-1">AI Readiness Score</p>
          <div className="text-5xl font-bold">
            <ScoreColor score={balancedData.ai_readiness_score} />
            <span className="text-lg text-gray-500 font-normal ml-1">/100</span>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Based on mention rate ({mentionRate}%), platform coverage,
            and recommendation context across {platforms.join(", ")}.
          </p>
        </div>
      )}

      {/* Fast-only summary when balanced isn't ready */}
      {!balancedData && (
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

      {/* Competitor Comparison — only with balanced data */}
      {balancedData && (
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
                <td className="text-right py-2.5">{balancedData.mention_rate}%</td>
                <td className="text-right py-2.5 text-gray-500">—</td>
              </tr>
              {balancedData.competitor_comparison.map((comp) => (
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

      {/* Recommendations — only with balanced data */}
      {balancedData && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">
            {balancedData.recommendation_count} Recommendations
          </h2>

          {/* Top recommendation - shown in full */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                balancedData.top_recommendation.priority === "P1"
                  ? "bg-red-900/50 text-red-300"
                  : balancedData.top_recommendation.priority === "P2"
                    ? "bg-yellow-900/50 text-yellow-300"
                    : "bg-gray-700 text-gray-300"
              }`}>
                {balancedData.top_recommendation.priority}
              </span>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                balancedData.top_recommendation.impact === "HIGH"
                  ? "bg-green-900/50 text-green-300"
                  : balancedData.top_recommendation.impact === "MEDIUM"
                    ? "bg-yellow-900/50 text-yellow-300"
                    : "bg-gray-700 text-gray-300"
              }`}>
                {balancedData.top_recommendation.impact} impact
              </span>
            </div>
            <h3 className="font-medium mb-1">{balancedData.top_recommendation.title}</h3>
            <p className="text-sm text-gray-400">{balancedData.top_recommendation.description}</p>
          </div>

          {/* Blurred placeholder for remaining recommendations */}
          {balancedData.recommendation_count > 1 && (
            <div className="relative">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 blur-sm">
                <div className="h-3 bg-gray-700 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-700 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-700 rounded w-2/3" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm font-medium text-gray-300">
                  {balancedData.recommendation_count - 1} more recommendation{balancedData.recommendation_count - 1 !== 1 ? "s" : ""} — unlock with a plan
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <a
        href={`/plans?jobId=${jobId}&email=${encodeURIComponent(status.email ?? "")}`}
        className="block w-full text-center py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
      >
        Unlock all recommendations — choose a plan &rarr;
      </a>
    </div>
  );
}
