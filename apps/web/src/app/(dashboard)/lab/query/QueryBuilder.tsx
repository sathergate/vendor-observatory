"use client";

import { useState } from "react";
import Link from "next/link";

const QUERY_TYPES = [
  { id: "vendorWinRate", label: "Vendor Win Rate", description: "Win rate for a vendor across scenarios" },
  { id: "headToHead", label: "Head-to-Head", description: "Direct comparison between two vendors" },
  { id: "constraintCorrelation", label: "Constraint Impact", description: "How constraints affect vendor selection" },
  { id: "platformComparison", label: "Platform Comparison", description: "Cross-platform recommendation differences" },
  { id: "promptDifficulty", label: "Prompt Difficulty", description: "Shannon entropy of vendor distribution per prompt" },
  { id: "whatIf", label: "What-If Simulation", description: "Simulate adding/removing constraints" },
] as const;

type QueryType = (typeof QUERY_TYPES)[number]["id"];

interface QueryBuilderProps {
  vendors: string[];
  categories: string[];
  constraints: string[];
}

function vendorDisplay(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function QueryBuilder({ vendors, categories, constraints }: QueryBuilderProps) {
  const [activeType, setActiveType] = useState<QueryType | null>(null);
  const [vendorA, setVendorA] = useState(vendors[0] ?? "");
  const [vendorB, setVendorB] = useState(vendors[1] ?? "");
  const [category, setCategory] = useState("");
  const [platform, setPlatform] = useState("");
  const [constraint, setConstraint] = useState("");
  const [addConstraints, setAddConstraints] = useState("");
  const [removeConstraints, setRemoveConstraints] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runQuery() {
    if (!activeType) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params = new URLSearchParams({ type: activeType });

      switch (activeType) {
        case "vendorWinRate":
          params.set("vendor", vendorA);
          if (category) params.set("category", category);
          if (platform) params.set("platform", platform);
          if (constraint) params.set("constraint", constraint);
          break;
        case "headToHead":
          params.set("vendorA", vendorA);
          params.set("vendorB", vendorB);
          break;
        case "constraintCorrelation":
          params.set("vendor", vendorA);
          if (constraint) params.set("constraint", constraint);
          break;
        case "platformComparison":
          params.set("vendor", vendorA);
          if (category) params.set("category", category);
          break;
        case "promptDifficulty":
          if (category) params.set("category", category);
          break;
        case "whatIf":
          params.set("vendor", vendorA);
          if (addConstraints) params.set("addConstraints", addConstraints);
          if (removeConstraints) params.set("removeConstraints", removeConstraints);
          break;
      }

      const res = await fetch(`/api/query?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Query type selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {QUERY_TYPES.map((qt) => (
          <button
            key={qt.id}
            onClick={() => { setActiveType(qt.id); setResult(null); setError(null); }}
            className={`rounded-[6px] p-4 border text-left transition-colors ${
              activeType === qt.id
                ? "bg-accent/10 border-accent/40"
                : "bg-surface border-border hover:border-accent/20"
            }`}
          >
            <p className="text-[13px] font-medium text-primary">{qt.label}</p>
            <p className="text-[12px] text-muted mt-1">{qt.description}</p>
          </button>
        ))}
      </div>

      {/* Parameter inputs */}
      {activeType && (
        <div className="bg-surface rounded-[6px] p-6 border border-border space-y-4">
          <h3 className="text-[13px] font-semibold text-primary uppercase tracking-wider">Parameters</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Vendor A — shown for most query types */}
            {activeType !== "promptDifficulty" && (
              <div>
                <label className="text-[12px] text-muted block mb-1">
                  {activeType === "headToHead" ? "Vendor A" : "Vendor"}
                </label>
                <select
                  value={vendorA}
                  onChange={(e) => setVendorA(e.target.value)}
                  className="w-full bg-raised border border-border rounded-[6px] px-3 py-2 text-[13px] text-primary"
                >
                  {vendors.map((v) => (
                    <option key={v} value={v}>{vendorDisplay(v)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Vendor B — only for head-to-head */}
            {activeType === "headToHead" && (
              <div>
                <label className="text-[12px] text-muted block mb-1">Vendor B</label>
                <select
                  value={vendorB}
                  onChange={(e) => setVendorB(e.target.value)}
                  className="w-full bg-raised border border-border rounded-[6px] px-3 py-2 text-[13px] text-primary"
                >
                  {vendors.map((v) => (
                    <option key={v} value={v}>{vendorDisplay(v)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Category filter */}
            {["vendorWinRate", "platformComparison", "promptDifficulty"].includes(activeType) && (
              <div>
                <label className="text-[12px] text-muted block mb-1">Category (optional)</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-raised border border-border rounded-[6px] px-3 py-2 text-[13px] text-primary"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Platform filter */}
            {activeType === "vendorWinRate" && (
              <div>
                <label className="text-[12px] text-muted block mb-1">Platform (optional)</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full bg-raised border border-border rounded-[6px] px-3 py-2 text-[13px] text-primary"
                >
                  <option value="">All platforms</option>
                  <option value="claude_code">Claude Code</option>
                  <option value="codex_cli">Codex CLI</option>
                  <option value="cursor">Cursor</option>
                </select>
              </div>
            )}

            {/* Constraint filter */}
            {["vendorWinRate", "constraintCorrelation"].includes(activeType) && (
              <div>
                <label className="text-[12px] text-muted block mb-1">Constraint (optional)</label>
                <select
                  value={constraint}
                  onChange={(e) => setConstraint(e.target.value)}
                  className="w-full bg-raised border border-border rounded-[6px] px-3 py-2 text-[13px] text-primary"
                >
                  <option value="">All constraints</option>
                  {constraints.map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
            )}

            {/* What-If constraints */}
            {activeType === "whatIf" && (
              <>
                <div>
                  <label className="text-[12px] text-muted block mb-1">Add constraints (comma-separated)</label>
                  <input
                    type="text"
                    value={addConstraints}
                    onChange={(e) => setAddConstraints(e.target.value)}
                    placeholder="e.g. serverless, edge_runtime"
                    className="w-full bg-raised border border-border rounded-[6px] px-3 py-2 text-[13px] text-primary"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-muted block mb-1">Remove constraints (comma-separated)</label>
                  <input
                    type="text"
                    value={removeConstraints}
                    onChange={(e) => setRemoveConstraints(e.target.value)}
                    placeholder="e.g. free_tier, self_hosted"
                    className="w-full bg-raised border border-border rounded-[6px] px-3 py-2 text-[13px] text-primary"
                  />
                </div>
              </>
            )}
          </div>

          <button
            onClick={runQuery}
            disabled={loading}
            className="px-6 py-2 rounded-[6px] bg-accent text-[13px] font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Running..." : "Run Query"}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-data-4/10 rounded-[6px] p-4 border border-data-4/30">
          <p className="text-[13px] text-data-4">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && <QueryResult type={activeType!} data={result} />}
    </>
  );
}

// ── Result rendering ────────────────────────────────────────────────────

function QueryResult({ type, data }: { type: QueryType; data: Record<string, unknown> }) {
  const result = data.result as Record<string, unknown> | undefined;
  if (!result && !data) return null;

  switch (type) {
    case "headToHead":
      return <HeadToHeadResult data={result ?? data} />;
    case "vendorWinRate":
      return <WinRateResult data={result ?? data} />;
    case "constraintCorrelation":
      return <ConstraintResult data={result ?? data} />;
    case "platformComparison":
      return <PlatformResult data={result ?? data} />;
    case "promptDifficulty":
      return <DifficultyResult data={result ?? data} />;
    case "whatIf":
      return <WhatIfResult data={result ?? data} />;
    default:
      return <RawResult data={data} />;
  }
}

function HeadToHeadResult({ data }: { data: Record<string, unknown> }) {
  const vendorA = data.vendorA as string;
  const vendorB = data.vendorB as string;
  const aWins = data.aWins as number ?? 0;
  const bWins = data.bWins as number ?? 0;
  const ties = data.ties as number ?? 0;
  const scenarios = (data.scenarios as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="bg-surface rounded-[6px] p-6 border border-border space-y-6">
      <h3 className="section-header">Head-to-Head: {vendorDisplay(vendorA)} vs {vendorDisplay(vendorB)}</h3>

      {/* Win summary */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="bg-raised rounded-[6px] p-4">
          <p className="text-[12px] text-muted uppercase">{vendorDisplay(vendorA)}</p>
          <p className="font-data text-[24px] text-data-1 mt-1">{aWins}</p>
          <p className="text-[11px] text-muted">wins</p>
        </div>
        <div className="bg-raised rounded-[6px] p-4">
          <p className="text-[12px] text-muted uppercase">Ties</p>
          <p className="font-data text-[24px] text-secondary mt-1">{ties}</p>
          <p className="text-[11px] text-muted">scenarios</p>
        </div>
        <div className="bg-raised rounded-[6px] p-4">
          <p className="text-[12px] text-muted uppercase">{vendorDisplay(vendorB)}</p>
          <p className="font-data text-[24px] text-data-4 mt-1">{bWins}</p>
          <p className="text-[11px] text-muted">wins</p>
        </div>
      </div>

      {/* Scenario breakdown */}
      {scenarios.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="th-label text-left px-4 h-10">Scenario</th>
                <th className="th-label text-left px-4 h-10">Winner</th>
                <th className="th-label text-left px-4 h-10">Category</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.slice(0, 20).map((s, i) => {
                const winner = s.winner as string;
                return (
                  <tr key={i} className="border-b border-border-subtle hover:bg-raised h-10">
                    <td className="px-4 py-1 text-secondary font-mono text-[12px]">{s.promptId as string}</td>
                    <td className="px-4 py-1">
                      <span className={winner === vendorA ? "text-data-1" : winner === vendorB ? "text-data-4" : "text-muted"}>
                        {winner ? vendorDisplay(winner) : "Tie"}
                      </span>
                    </td>
                    <td className="px-4 py-1 text-muted text-[12px]">{(s.category as string)?.replace(/_/g, " ") ?? "\u2014"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WinRateResult({ data }: { data: Record<string, unknown> }) {
  const vendor = data.vendor as string;
  const overall = data.overallWinRate as number ?? data.winRate as number ?? 0;
  const byCategory = (data.byCategory as Array<Record<string, unknown>>) ?? [];
  const byPlatform = (data.byPlatform as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="bg-surface rounded-[6px] p-6 border border-border space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="section-header">Win Rate: {vendor ? vendorDisplay(vendor) : "Vendor"}</h3>
        <span className="font-data text-[24px] text-accent">{pct(overall)}</span>
      </div>

      {byCategory.length > 0 && (
        <div>
          <h4 className="text-[12px] text-muted uppercase tracking-wider mb-2">By Category</h4>
          <div className="space-y-2">
            {byCategory.map((c, i) => {
              const cat = c.category as string;
              const wr = c.winRate as number ?? 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[12px] text-secondary w-32 shrink-0">{cat?.replace(/_/g, " ")}</span>
                  <div className="flex-1 bg-raised rounded-[6px] h-2">
                    <div className="bg-accent/60 h-full rounded-[6px]" style={{ width: `${wr * 100}%` }} />
                  </div>
                  <span className="font-data text-[12px] text-primary w-12 text-right">{pct(wr)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {byPlatform.length > 0 && (
        <div>
          <h4 className="text-[12px] text-muted uppercase tracking-wider mb-2">By Platform</h4>
          <div className="grid grid-cols-3 gap-3">
            {byPlatform.map((p, i) => (
              <div key={i} className="bg-raised rounded-[6px] p-3 text-center">
                <p className="text-[11px] text-muted">{(p.platform as string)?.replace(/_/g, " ")}</p>
                <p className="font-data text-[16px] text-primary mt-1">{pct(p.winRate as number ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConstraintResult({ data }: { data: Record<string, unknown> }) {
  const correlations = (data.correlations as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="bg-surface rounded-[6px] p-6 border border-border space-y-4">
      <h3 className="section-header">Constraint Impact</h3>
      {correlations.length > 0 ? (
        <div className="space-y-3">
          {correlations.map((c, i) => (
            <div key={i} className="flex items-center gap-4 text-[13px]">
              <span className="font-mono text-accent w-40 shrink-0">{(c.constraint as string)?.replace(/_/g, " ")}</span>
              <div className="flex-1 bg-raised rounded-[6px] h-2">
                <div className="bg-accent/60 h-full rounded-[6px]" style={{ width: `${Math.abs(c.correlation as number ?? 0) * 100}%` }} />
              </div>
              <span className={`font-data w-16 text-right ${(c.correlation as number ?? 0) > 0 ? "text-data-5" : "text-data-4"}`}>
                {((c.correlation as number ?? 0) > 0 ? "+" : "")}{((c.correlation as number ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <RawResult data={data} />
      )}
    </div>
  );
}

function PlatformResult({ data }: { data: Record<string, unknown> }) {
  const comparisons = (data.comparisons as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="bg-surface rounded-[6px] p-6 border border-border space-y-4">
      <h3 className="section-header">Platform Comparison</h3>
      {comparisons.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="th-label text-left px-4 h-10">Vendor</th>
                <th className="th-label text-right px-4 h-10">Claude Code</th>
                <th className="th-label text-right px-4 h-10">Codex CLI</th>
                <th className="th-label text-right px-4 h-10">Cursor</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c, i) => (
                <tr key={i} className="border-b border-border-subtle hover:bg-raised h-10">
                  <td className="px-4 py-1 text-primary">{vendorDisplay(c.vendor as string)}</td>
                  <td className="px-4 py-1 text-right font-data text-data-1">{c.claude_code != null ? pct(c.claude_code as number) : "\u2014"}</td>
                  <td className="px-4 py-1 text-right font-data text-data-2">{c.codex_cli != null ? pct(c.codex_cli as number) : "\u2014"}</td>
                  <td className="px-4 py-1 text-right font-data text-data-3">{c.cursor != null ? pct(c.cursor as number) : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <RawResult data={data} />
      )}
    </div>
  );
}

function DifficultyResult({ data }: { data: Record<string, unknown> }) {
  const prompts = (data.prompts as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="bg-surface rounded-[6px] p-6 border border-border space-y-4">
      <h3 className="section-header">Prompt Difficulty (Shannon Entropy)</h3>
      <p className="text-[12px] text-muted">Higher entropy = more contested (no clear vendor winner).</p>
      {prompts.length > 0 ? (
        <div className="space-y-2">
          {prompts.slice(0, 20).map((p, i) => {
            const entropy = p.entropy as number ?? 0;
            return (
              <div key={i} className="flex items-center gap-3 text-[13px]">
                <span className="text-secondary font-mono text-[12px] w-48 shrink-0 truncate">{p.promptId as string}</span>
                <div className="flex-1 bg-raised rounded-[6px] h-2">
                  <div
                    className={`h-full rounded-[6px] ${entropy > 1.5 ? "bg-data-4/60" : entropy > 0.8 ? "bg-data-3/60" : "bg-data-5/60"}`}
                    style={{ width: `${Math.min(100, (entropy / 3) * 100)}%` }}
                  />
                </div>
                <span className="font-data text-[12px] w-12 text-right text-primary">{entropy.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <RawResult data={data} />
      )}
    </div>
  );
}

function WhatIfResult({ data }: { data: Record<string, unknown> }) {
  const baseline = data.baselineWinRate as number ?? 0;
  const simulated = data.simulatedWinRate as number ?? 0;
  const delta = simulated - baseline;

  return (
    <div className="bg-surface rounded-[6px] p-6 border border-border space-y-4">
      <h3 className="section-header">What-If Simulation</h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="bg-raised rounded-[6px] p-4">
          <p className="text-[12px] text-muted uppercase">Baseline</p>
          <p className="font-data text-[20px] text-secondary mt-1">{pct(baseline)}</p>
        </div>
        <div className="bg-raised rounded-[6px] p-4">
          <p className="text-[12px] text-muted uppercase">Simulated</p>
          <p className="font-data text-[20px] text-accent mt-1">{pct(simulated)}</p>
        </div>
        <div className="bg-raised rounded-[6px] p-4">
          <p className="text-[12px] text-muted uppercase">Delta</p>
          <p className={`font-data text-[20px] mt-1 ${delta > 0 ? "text-data-5" : delta < 0 ? "text-data-4" : "text-muted"}`}>
            {delta > 0 ? "+" : ""}{pct(delta)}
          </p>
        </div>
      </div>
      {/* Fallback to raw if other fields present */}
      {!data.baselineWinRate && !data.simulatedWinRate && <RawResult data={data} />}
    </div>
  );
}

function RawResult({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="bg-surface rounded-[6px] p-6 border border-border">
      <h3 className="section-header mb-3">Result</h3>
      <pre className="text-[12px] font-mono text-secondary bg-raised rounded-[6px] p-4 overflow-x-auto max-h-[400px] overflow-y-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
