"use client";

import { useState } from "react";
import Link from "next/link";
import type { FactorDef, VendorFactorData, CategoryFactorSummary } from "@/lib/load-vendor-factors";
import type { Confidence } from "@/lib/load-vendor-factors";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";

// ── Score cell color mapping ─────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score == null) return "bg-signal-absent";
  switch (score) {
    case 5: return "bg-data-1";
    case 4: return "bg-data-1/60";
    case 3: return "bg-data-muted";
    case 2: return "bg-data-4/60";
    case 1: return "bg-data-4";
    default: return "bg-data-muted";
  }
}

function confidenceBorder(confidence: Confidence): string {
  if (confidence === "high") return "border-transparent";
  if (confidence === "medium") return "border-border border-dashed";
  return "border-border-subtle border-dashed";
}

// ── Category display names ───────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  database: "Database",
  ci_cd: "CI/CD",
  observability: "Observability",
  error_monitoring: "Error Monitoring",
  feature_flags: "Feature Flags",
  secrets_management: "Secrets Management",
  developer_portal: "Developer Portal",
  llm_observability: "LLM Observability",
  incident_management: "Incident Management",
  code_search: "Code Search",
  security_scanning: "Security Scanning",
  edge_compute: "Edge Compute",
};

// ── Heatmap cell ─────────────────────────────────────────────────────

function HeatmapCell({
  score,
  confidence,
  vendorId,
  factorLabel,
  notes,
}: {
  score: number | null;
  confidence: Confidence;
  vendorId: string;
  factorLabel: string;
  notes?: string;
}) {
  return (
    <div
      className={`
        w-full aspect-square rounded-[3px] border
        ${scoreColor(score)} ${confidenceBorder(confidence)}
        cursor-pointer transition-transform hover:scale-110 hover:z-10 relative group
      `}
      title={`${vendorDisplayName(vendorId)} · ${factorLabel}: ${score ?? "N/A"}${notes ? ` — ${notes}` : ""}`}
    >
      {/* Hover tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-20 pointer-events-none">
        <div className="bg-raised border border-border rounded-[4px] px-2 py-1 whitespace-nowrap shadow-lg">
          <span className="font-data text-[12px] text-primary">{score ?? "—"}</span>
          <span className="text-[11px] text-muted ml-1">/5</span>
        </div>
      </div>
    </div>
  );
}

// ── Main heatmap component ───────────────────────────────────────────

export function FactorHeatmap({
  factors,
  byCategory,
}: {
  factors: FactorDef[];
  byCategory: Record<string, CategoryFactorSummary>;
}) {
  const [mode, setMode] = useState<"expanded" | "collapsed">("collapsed");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const categories = Object.entries(byCategory).sort(
    ([, a], [, b]) => b.vendorCount - a.vendorCount,
  );

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  return (
    <div className="bg-surface rounded-[6px] p-6 border border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="section-header">Factor Heatmap</h3>
          <p className="text-[12px] text-muted mt-0.5">
            Rows: vendors grouped by category · Columns: factors ordered by weight
          </p>
        </div>
        <div className="flex items-center gap-1 bg-raised rounded-[6px] p-0.5">
          <button
            onClick={() => setMode("collapsed")}
            className={`px-3 py-1 rounded-[4px] text-[12px] font-medium transition-colors ${
              mode === "collapsed" ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-secondary"
            }`}
          >
            Collapsed
          </button>
          <button
            onClick={() => setMode("expanded")}
            className={`px-3 py-1 rounded-[4px] text-[12px] font-medium transition-colors ${
              mode === "expanded" ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-secondary"
            }`}
          >
            Expanded
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-4 text-[11px] text-muted">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-[2px] bg-data-1" /> 5</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-[2px] bg-data-1/60" /> 4</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-[2px] bg-data-muted" /> 3</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-[2px] bg-data-4/60" /> 2</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-[2px] bg-data-4" /> 1</span>
        <span className="ml-2 border-l border-border-subtle pl-2">
          <span className="border border-dashed border-border-subtle rounded-[2px] w-3 h-3 inline-block" /> inferred
        </span>
      </div>

      {/* Column headers */}
      <div className="grid gap-px" style={{ gridTemplateColumns: `180px repeat(${factors.length}, 1fr)` }}>
        <div /> {/* empty corner */}
        {factors.map((f) => (
          <div key={f.id} className="text-center px-0.5">
            <span
              className="text-[10px] text-muted uppercase tracking-wider block truncate"
              title={f.label}
            >
              {f.short}
            </span>
          </div>
        ))}

        {/* Category rows */}
        {categories.map(([catId, cat]) => {
          const isExpanded = mode === "expanded" || expandedCategories.has(catId);

          return (
            <div key={catId} className="contents">
              {/* Category header row */}
              <button
                onClick={() => mode === "collapsed" && toggleCategory(catId)}
                className={`text-left px-2 py-1.5 rounded-[3px] text-[12px] font-medium transition-colors flex items-center gap-1.5 ${
                  mode === "collapsed" ? "hover:bg-raised cursor-pointer" : "cursor-default"
                } text-secondary`}
              >
                {mode === "collapsed" && (
                  <span className={`text-[9px] text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                    ▸
                  </span>
                )}
                <Link
                  href={`/fixes/factors/category/${catId}`}
                  className="hover:text-accent transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {CATEGORY_LABELS[catId] ?? catId}
                </Link>
                <span className="text-[10px] text-muted ml-1">({cat.vendorCount})</span>
              </button>

              {/* Category average scores (shown when collapsed and not expanded) */}
              {mode === "collapsed" && !isExpanded && factors.map((f) => (
                <div key={f.id} className="flex items-center justify-center py-1.5">
                  <div
                    className={`w-full aspect-square rounded-[3px] ${scoreColor(Math.round(cat.avgScores[f.id] ?? 0))} opacity-50`}
                    title={`${CATEGORY_LABELS[catId] ?? catId} avg: ${(cat.avgScores[f.id] ?? 0).toFixed(1)}`}
                  />
                </div>
              ))}

              {/* Individual vendor rows */}
              {isExpanded && cat.vendors
                .sort((a, b) => b.compositeScore - a.compositeScore)
                .map((vendor) => (
                  <div key={vendor.vendorId} className="contents">
                    <Link
                      href={`/fixes/factors/${vendor.vendorId}`}
                      className="text-[12px] text-secondary hover:text-accent pl-5 py-1 truncate flex items-center transition-colors"
                      title={vendorDisplayName(vendor.vendorId)}
                    >
                      {vendorDisplayName(vendor.vendorId)}
                    </Link>
                    {factors.map((f) => (
                      <div key={f.id} className="flex items-center justify-center py-1 px-0.5">
                        <HeatmapCell
                          score={vendor.scores[f.id] ?? null}
                          confidence={vendor.confidence}
                          vendorId={vendor.vendorId}
                          factorLabel={f.label}
                          notes={vendor.notes}
                        />
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
