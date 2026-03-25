"use client";

import { useState } from "react";
import type { SideBySideResponse } from "@/lib/db";
import { PlatformBadge } from "./PlatformBadge";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";

export function SideBySideComparison({
  promptId,
  responses,
  promptText,
  template,
}: {
  promptId: string;
  responses: SideBySideResponse[];
  promptText?: string;
  template?: string;
}) {
  if (responses.length < 2) return null;

  return (
    <div className="space-y-3">
      {/* Prompt header */}
      <div className="flex items-center gap-2 flex-wrap">
        {template && (
          <span className="inline-block rounded-[4px] bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">
            {template}
          </span>
        )}
        <span className="text-muted text-[11px]">
          same prompt, {responses.length} agents
        </span>
      </div>

      {/* Side-by-side cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {responses.map((r) => (
          <ResponseCard key={`${r.prompt_id}-${r.platform}`} response={r} />
        ))}
      </div>
    </div>
  );
}

function ResponseCard({ response }: { response: SideBySideResponse }) {
  const [expanded, setExpanded] = useState(false);
  const pickLabel = response.is_custom_diy
    ? "Custom/DIY"
    : response.primary_vendor
      ? vendorDisplayName(response.primary_vendor)
      : "No pick";

  const pickBadgeClass = response.is_custom_diy
    ? "bg-data-3/15 text-data-3"
    : response.primary_vendor
      ? "bg-data-1/15 text-data-1"
      : "bg-raised text-muted";

  return (
    <div className="bg-surface rounded-[6px] border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <PlatformBadge platform={response.platform} size="sm" />
        <span className="text-muted text-[11px] font-data">
          {response.model_id ?? ""}
        </span>
      </div>

      {/* Primary pick */}
      <div className="px-3 py-2">
        <p className="text-muted text-[11px] uppercase tracking-wide">
          Primary Pick
        </p>
        <span
          className={`inline-block mt-1 rounded-[4px] px-2 py-0.5 text-[12px] font-medium ${pickBadgeClass}`}
        >
          {pickLabel} #1
        </span>
      </div>

      {/* Rationale */}
      {response.rationale_snippet && (
        <div className="px-3 pb-2">
          <p className="text-secondary text-[13px] leading-relaxed">
            {response.rationale_snippet}
          </p>
        </div>
      )}

      {/* Expandable full reasoning */}
      {response.reasoning_chain && (
        <div className="px-3 pb-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-accent text-[12px] hover:underline cursor-pointer"
          >
            {expanded ? "▾ Hide full response" : "▸ Read full response"}
          </button>
          {expanded && (
            <div className="mt-2 text-secondary text-[12px] leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto border-t border-border-subtle pt-2">
              {response.reasoning_chain}
            </div>
          )}
        </div>
      )}

      {/* Constraints addressed */}
      {response.constraints_addressed.length > 0 && (
        <div className="px-3 pb-3 flex flex-wrap gap-1">
          {response.constraints_addressed.map((c) => (
            <span
              key={c}
              className="inline-block rounded-[4px] bg-raised px-1.5 py-0.5 text-[10px] text-muted"
            >
              ✓ {c.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
