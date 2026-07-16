"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import type { JobStatus, StageStatus } from "@/lib/onboard";
import { FLAGS } from "@/lib/flags";

// ── Stage indicator sub-component ────────────────────────────────────

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "pending") {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-border" />
    );
  }
  if (status === "running") {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    );
  }
  // complete
  return (
    <div className="w-6 h-6 rounded-full bg-signal-strong flex items-center justify-center">
      <svg className="w-3.5 h-3.5 text-base" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

function StageCard({
  label,
  status,
  teaser,
}: {
  label: string;
  status: StageStatus;
  teaser: string | null;
}) {
  return (
    <div className="bg-surface border border-border rounded-[6px] p-4">
      <div className="flex items-center gap-3">
        <StageIcon status={status} />
        <div className="min-w-0">
          <p className="font-medium text-[13px] text-primary">{label}</p>
          {teaser && status === "complete" && (
            <p className="text-[12px] text-secondary mt-0.5 truncate">{teaser}</p>
          )}
          {status === "running" && (
            <p className="text-[12px] text-accent mt-0.5">Analyzing...</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Skeleton loading state ──────────────────────────────────────────

function StatusSkeleton() {
  return (
    <div className="max-w-xl mx-auto px-6 py-12 animate-pulse">
      {/* Heading skeleton */}
      <div className="h-7 bg-raised rounded w-3/5 mb-2" />
      <div className="h-4 bg-raised rounded w-1/4 mb-8" />

      {/* Stage card skeletons */}
      <div className="space-y-3 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-[6px] p-4">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-raised" />
              <div className="flex-1">
                <div className="h-4 bg-raised rounded w-2/5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Email capture skeleton */}
      <div className="bg-surface border border-border rounded-[6px] p-6">
        <div className="h-5 bg-raised rounded w-4/5 mb-2" />
        <div className="h-4 bg-raised rounded w-3/5 mb-4" />
        <div className="flex gap-2">
          <div className="flex-1 h-10 bg-raised rounded-[6px]" />
          <div className="w-36 h-10 bg-raised rounded-[6px]" />
        </div>
      </div>
    </div>
  );
}

// ── Adaptive polling interval ───────────────────────────────────────

function getPollingInterval(status: JobStatus): number {
  if (status.stages.balanced.status === "complete") return 10_000;
  if (status.stages.fast.status === "complete") return 8_000;
  if (status.stages.url_analysis.status === "complete") return 4_000;
  return 2_000;
}

// ── Initial diagnosis (FLAG_ONBOARDING_DIAGNOSIS) ───────────────────

function InitialDiagnosis({
  status,
  jobId,
}: {
  status: JobStatus;
  jobId: string;
}) {
  const urlData = status.stages.url_analysis.data;
  const balancedData = status.stages.balanced.data;

  // Need at least URL analysis data for competitors
  if (!urlData) return null;

  const competitors = urlData.competitors.slice(0, 3);
  const topRec = balancedData?.top_recommendation ?? null;

  return (
    <div className="bg-surface border border-border rounded-[6px] p-6 mb-6">
      <h2 className="section-header text-[13px] text-muted uppercase tracking-wider mb-4">
        Initial Diagnosis
      </h2>

      {/* Top competitors */}
      {competitors.length > 0 && (
        <div className="mb-5">
          <p className="text-[13px] font-medium text-primary mb-2">
            Top competitors in {urlData.category}
          </p>
          <div className="flex flex-wrap gap-2">
            {competitors.map((name) => (
              <span
                key={name}
                className="inline-flex items-center px-2.5 py-1 bg-raised border border-border-subtle rounded-[6px] text-[12px] font-data text-secondary"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top recommendation */}
      {topRec && (
        <div className="mb-5">
          <p className="text-[13px] font-medium text-primary mb-2">
            Top recommendation
          </p>
          <div className="bg-base border border-border rounded-[6px] p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-[6px] font-data ${
                  topRec.priority === "P1"
                    ? "bg-signal-noise/15 text-signal-noise"
                    : topRec.priority === "P2"
                      ? "bg-data-3/15 text-data-3"
                      : "bg-raised text-secondary"
                }`}
              >
                {topRec.priority}
              </span>
              <span
                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-[6px] font-data ${
                  topRec.impact === "HIGH"
                    ? "bg-signal-strong/15 text-signal-strong"
                    : topRec.impact === "MEDIUM"
                      ? "bg-data-3/15 text-data-3"
                      : "bg-raised text-secondary"
                }`}
              >
                {topRec.impact} impact
              </span>
            </div>
            <p className="text-[13px] font-medium text-primary">
              {topRec.title}
            </p>
            <p className="text-[12px] text-secondary mt-0.5">
              {topRec.description}
            </p>
          </div>
        </div>
      )}

      {/* CTA */}
      <a
        href={`/get-started/${jobId}/scorecard`}
        className="block w-full text-center py-2.5 bg-accent hover:bg-accent/90 rounded-[6px] font-medium text-[13px] transition-colors"
      >
        See full scorecard
      </a>
    </div>
  );
}

// ── Main status page ─────────────────────────────────────────────────

export default function StatusPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/onboard/analyze/${jobId}`);
      if (!res.ok) return;
      const data: JobStatus = await res.json();
      setStatus(data);
      if (data.email) setEmailSubmitted(true);

      // Schedule next poll with adaptive interval (stop when comprehensive is done)
      if (data.stages.comprehensive.status !== "complete") {
        const delay = getPollingInterval(data);
        timerRef.current = setTimeout(poll, delay);
      }
    } catch {
      // Retry on next interval
      timerRef.current = setTimeout(poll, 5_000);
    }
  }, [jobId]);

  useEffect(() => {
    poll();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailLoading(true);
    try {
      await fetch(`/api/onboard/analyze/${jobId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setEmailSubmitted(true);
    } catch {
      // ignore
    } finally {
      setEmailLoading(false);
    }
  }

  if (!status) {
    return <StatusSkeleton />;
  }

  const fastDone = status.stages.fast.status === "complete";
  const urlData = status.stages.url_analysis.data;
  const fastData = status.stages.fast.data;

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-1 text-primary">
        {urlData ? `Analyzing ${urlData.detected_name}` : "Running analysis..."}
      </h1>
      <p className="text-secondary text-[13px] mb-8">{status.domain}</p>

      {/* Stage cards */}
      <div className="space-y-3 mb-8">
        <StageCard
          label="URL Analysis"
          status={status.stages.url_analysis.status}
          teaser={urlData ? `${urlData.detected_name} — ${urlData.category}` : null}
        />
        <StageCard
          label="Fast Benchmark"
          status={status.stages.fast.status}
          teaser={fastData ? `Mention rate: ${fastData.mention_rate}%` : null}
        />
        <StageCard
          label="Balanced Benchmark"
          status={status.stages.balanced.status}
          teaser={
            status.stages.balanced.data
              ? `Detection score: ${status.stages.balanced.data.ai_readiness_score}/100`
              : null
          }
        />
        <StageCard
          label="Comprehensive Benchmark"
          status={status.stages.comprehensive.status}
          teaser={
            status.stages.comprehensive.data
              ? `${status.stages.comprehensive.data.sessions_analyzed} sessions across ${status.stages.comprehensive.data.platforms.length} platforms`
              : null
          }
        />
      </div>

      {/* Initial diagnosis — show when flag is on and fast benchmark is done */}
      {FLAGS.ONBOARDING_DIAGNOSIS && fastDone && (
        <InitialDiagnosis status={status} jobId={jobId} />
      )}

      {/* Email capture — show immediately, hide once submitted */}
      {!emailSubmitted && (
        <div className="bg-surface border border-border rounded-[6px] p-6 mb-6">
          <p className="font-medium mb-1 text-[14px] text-primary">Your comprehensive report is almost ready</p>
          <p className="text-[13px] text-secondary mb-4">
            Leave your email and we&apos;ll send it when it&apos;s done.
          </p>
          <form onSubmit={submitEmail} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              disabled={emailLoading}
              className="flex-1 px-3 py-2 bg-raised border border-border-subtle rounded-[6px] text-primary text-[14px]
                         focus:outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={emailLoading}
              className="px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 rounded-[6px] font-medium text-[14px]"
            >
              {emailLoading ? "..." : "Send me the report"}
            </button>
          </form>
        </div>
      )}

      {/* Email submitted confirmation */}
      {emailSubmitted && (
        <div className="bg-surface border border-border rounded-[6px] p-6 mb-6">
          <p className="text-signal-strong font-medium text-[14px]">
            We&apos;ll send your comprehensive report when it&apos;s ready.
          </p>
        </div>
      )}

      {/* Scorecard CTA — show once fast benchmark is done */}
      {fastDone && (
        <a
          href={`/get-started/${jobId}/scorecard`}
          className="block w-full text-center py-3 rounded-[6px] font-medium text-[14px] transition-colors bg-accent hover:bg-accent/90"
        >
          Go to scorecard
        </a>
      )}
    </div>
  );
}
