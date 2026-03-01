"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { JobStatus, StageStatus } from "@/lib/onboard";

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

// ── Main status page ─────────────────────────────────────────────────

export default function StatusPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  useEffect(() => {
    let stopped = false;

    async function poll() {
      try {
        const res = await fetch(`/api/onboard/analyze/${jobId}`);
        if (!res.ok) return;
        const data: JobStatus = await res.json();
        setStatus(data);
        if (data.email) setEmailSubmitted(true);
        if (data.stages.comprehensive.status === "complete") stopped = true;
      } catch {
        // ignore fetch errors, retry on next interval
      }
    }

    poll();
    const id = setInterval(() => {
      if (!stopped) poll();
    }, 2000);
    return () => clearInterval(id);
  }, [jobId]);

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
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center text-secondary text-[14px]">
        Loading...
      </div>
    );
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
          className={`block w-full text-center py-3 rounded-[6px] font-medium text-[14px] transition-colors ${
            emailSubmitted || status.email
              ? "bg-accent hover:bg-accent/90"
              : "bg-raised hover:bg-border-subtle text-secondary"
          }`}
        >
          Go to scorecard
        </a>
      )}
    </div>
  );
}
