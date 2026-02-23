"use client";

import { useState, useEffect, useCallback } from "react";
// ── Types ──────────────────────────────────────────────────────────────

type QueryType =
  | "vendorWinRate"
  | "constraintCorrelation"
  | "platformComparison"
  | "headToHead"
  | "promptDifficulty"
  | "whatIf";

interface AutocompleteData {
  vendors: string[];
  constraints: string[];
  categories: string[];
  platforms: string[];
  promptIds: string[];
}

const QUERY_CONFIG: Record<
  QueryType,
  { label: string; description: string; requiredParams: string[] }
> = {
  vendorWinRate: {
    label: "Vendor Win Rate",
    description: "Win rate for a vendor with optional category/platform/constraint filters",
    requiredParams: ["vendor"],
  },
  constraintCorrelation: {
    label: "Constraint Correlation",
    description: "How a constraint affects each vendor's win rate",
    requiredParams: ["constraint"],
  },
  platformComparison: {
    label: "Platform Comparison",
    description: "Side-by-side vendor picks across platforms for a prompt or category",
    requiredParams: ["key"],
  },
  headToHead: {
    label: "Head-to-Head",
    description: "Direct comparison between two vendors across all shared prompts",
    requiredParams: ["vendorA", "vendorB"],
  },
  promptDifficulty: {
    label: "Prompt Difficulty",
    description: "Shannon entropy of vendor distribution — how contested a prompt is",
    requiredParams: ["promptId"],
  },
  whatIf: {
    label: "What-If Simulation",
    description: "Simulated win rate delta if a constraint were added or removed",
    requiredParams: ["vendor"],
  },
};

// ── Component ──────────────────────────────────────────────────────────

export default function QueryBuilderPage() {
  const [queryType, setQueryType] = useState<QueryType>("vendorWinRate");
  const [autocomplete, setAutocomplete] = useState<AutocompleteData | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load autocomplete data on mount
  useEffect(() => {
    fetch("/api/query?type=autocomplete")
      .then((r) => r.json())
      .then(setAutocomplete)
      .catch(() => {});
  }, []);

  // Reset params when query type changes
  useEffect(() => {
    setParams({});
    setResult(null);
    setError(null);
  }, [queryType]);

  const setParam = useCallback((key: string, value: string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const urlParams = new URLSearchParams({ type: queryType });
    for (const [k, v] of Object.entries(params)) {
      if (v) urlParams.set(k, v);
    }

    try {
      const resp = await fetch(`/api/query?${urlParams.toString()}`);
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || `HTTP ${resp.status}`);
      } else {
        setResult(data.result ?? data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [queryType, params]);

  const config = QUERY_CONFIG[queryType];
  const canRun = config.requiredParams.every((p) => params[p]?.trim());

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Composable Query Builder</h1>
        <p className="text-gray-400 mt-1">
          Run ad-hoc analytical queries against vendor observatory data
        </p>
      </div>

      {/* Query Type Selector */}
      <div className="bg-gray-800 rounded-lg p-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-300">Query Type</span>
          <select
            value={queryType}
            onChange={(e) => setQueryType(e.target.value as QueryType)}
            className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {(Object.entries(QUERY_CONFIG) as [QueryType, typeof config][]).map(
              ([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ),
            )}
          </select>
        </label>
        <p className="text-sm text-gray-400">{config.description}</p>

        {/* Dynamic Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          <QueryParams
            queryType={queryType}
            params={params}
            setParam={setParam}
            autocomplete={autocomplete}
          />
        </div>

        {/* Run Button */}
        <div className="flex items-center gap-4 pt-2">
          <button
            onClick={runQuery}
            disabled={!canRun || loading}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {loading ? "Running..." : "Run Query"}
          </button>
          {!canRun && (
            <span className="text-sm text-yellow-400">
              Required: {config.requiredParams.join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">Results</h2>
          <ResultRenderer queryType={queryType} result={result} />
        </div>
      )}
    </div>
  );
}

// ── Dynamic Query Parameters ────────────────────────────────────────

function QueryParams({
  queryType,
  params,
  setParam,
  autocomplete,
}: {
  queryType: QueryType;
  params: Record<string, string>;
  setParam: (key: string, value: string) => void;
  autocomplete: AutocompleteData | null;
}): React.ReactNode {
  const ac = autocomplete;

  const fields: React.ReactNode[] = [];

  switch (queryType) {
    case "vendorWinRate":
      fields.push(
        <SelectField key="vendor" label="Vendor *" param="vendor" value={params.vendor} options={ac?.vendors} onChange={setParam} />,
        <SelectField key="category" label="Category" param="category" value={params.category} options={ac?.categories} onChange={setParam} placeholder="All categories" />,
        <SelectField key="platform" label="Platform" param="platform" value={params.platform} options={ac?.platforms} onChange={setParam} placeholder="All platforms" />,
        <SelectField key="constraint" label="Constraint" param="constraint" value={params.constraint} options={ac?.constraints} onChange={setParam} placeholder="No filter" />,
      );
      break;
    case "constraintCorrelation":
      fields.push(
        <SelectField key="constraint" label="Constraint *" param="constraint" value={params.constraint} options={ac?.constraints} onChange={setParam} />,
      );
      break;
    case "platformComparison":
      fields.push(
        <SelectField key="key" label="Key *" param="key" value={params.key} options={[...(ac?.promptIds ?? []), ...(ac?.categories ?? [])]} onChange={setParam} />,
        <SelectField key="keyType" label="Key Type" param="keyType" value={params.keyType || "prompt"} options={["prompt", "category"]} onChange={setParam} />,
      );
      break;
    case "headToHead":
      fields.push(
        <SelectField key="vendorA" label="Vendor A *" param="vendorA" value={params.vendorA} options={ac?.vendors} onChange={setParam} />,
        <SelectField key="vendorB" label="Vendor B *" param="vendorB" value={params.vendorB} options={ac?.vendors} onChange={setParam} />,
        <SelectField key="category" label="Category" param="category" value={params.category} options={ac?.categories} onChange={setParam} placeholder="All categories" />,
      );
      break;
    case "promptDifficulty":
      fields.push(
        <SelectField key="promptId" label="Prompt ID *" param="promptId" value={params.promptId} options={ac?.promptIds} onChange={setParam} />,
      );
      break;
    case "whatIf":
      fields.push(
        <SelectField key="vendor" label="Vendor *" param="vendor" value={params.vendor} options={ac?.vendors} onChange={setParam} />,
        <SelectField key="addConstraint" label="Add Constraint" param="addConstraint" value={params.addConstraint} options={ac?.constraints} onChange={setParam} placeholder="None" />,
        <SelectField key="removeConstraint" label="Remove Constraint" param="removeConstraint" value={params.removeConstraint} options={ac?.constraints} onChange={setParam} placeholder="None" />,
      );
      break;
  }

  return <>{fields}</>;
}

// ── Select Field Component ──────────────────────────────────────────

function SelectField({
  label,
  param,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  param: string;
  value?: string;
  options?: string[];
  onChange: (key: string, value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-300">{label}</span>
      <select
        value={value || ""}
        onChange={(e) => onChange(param, e.target.value)}
        className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">{placeholder || `Select ${label.replace(" *", "")}...`}</option>
        {(options || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── Result Renderers ────────────────────────────────────────────────

function ResultRenderer({
  queryType,
  result,
}: {
  queryType: QueryType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: Record<string, any>;
}) {
  if (!result) {
    return <p className="text-gray-400 text-sm">No results found.</p>;
  }

  switch (queryType) {
    case "vendorWinRate":
      return <VendorWinRateResult data={result as VendorWinRateData} />;
    case "constraintCorrelation":
      return <ConstraintCorrelationResult data={result as ConstraintCorrelationData} />;
    case "platformComparison":
      return <PlatformComparisonResult data={result as PlatformComparisonData} />;
    case "headToHead":
      return <HeadToHeadResult data={result as HeadToHeadData} />;
    case "promptDifficulty":
      return <PromptDifficultyResult data={result as PromptDifficultyData} />;
    case "whatIf":
      return <WhatIfResult data={result as WhatIfData} />;
    default:
      return <pre className="text-xs text-gray-300 overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>;
  }
}

// ── Result Type Definitions ─────────────────────────────────────────

interface VendorWinRateData {
  vendor: string;
  winRate: number;
  wins: number;
  total: number;
  breakdown: Array<{ dimension: string; value: string; wins: number; total: number; winRate: number }>;
}

interface ConstraintCorrelationData {
  constraint: string;
  vendors: Array<{ vendor: string; winsWithConstraint: number; totalWithConstraint: number; winRateWith: number; winsWithout: number; totalWithout: number; winRateWithout: number; delta: number }>;
}

interface PlatformComparisonData {
  groupKey: string;
  groupType: string;
  platforms: Record<string, { primaryVendor: string | null; vendorCounts: Record<string, number>; responseCount: number }>;
}

interface HeadToHeadData {
  vendorA: string;
  vendorB: string;
  scenarios: Array<{ prompt_id: string; category: string; winner: string | null; rationale: string | null }>;
  aWins: number;
  bWins: number;
  ties: number;
}

interface PromptDifficultyData {
  promptId: string;
  entropy: number;
  vendorCount: number;
  responseCount: number;
  vendorDistribution: Record<string, number>;
  dominantVendor: string | null;
  dominanceScore: number;
}

interface WhatIfData {
  vendor: string;
  currentWinRate: number;
  currentWins: number;
  currentTotal: number;
  simulatedWinRate: number;
  simulatedWins: number;
  simulatedTotal: number;
  delta: number;
  addedConstraint: string | null;
  removedConstraint: string | null;
}

// ── Result Components ───────────────────────────────────────────────

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function VendorWinRateResult({ data }: { data: VendorWinRateData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Win Rate" value={pct(data.winRate)} />
        <Stat label="Wins" value={String(data.wins)} />
        <Stat label="Total Mentions" value={String(data.total)} />
      </div>
      {data.breakdown.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            Breakdown by {data.breakdown[0].dimension}
          </h3>
          <DataTable
            headers={["Value", "Wins", "Total", "Win Rate"]}
            rows={data.breakdown.map((b) => [b.value, String(b.wins), String(b.total), pct(b.winRate)])}
          />
        </div>
      )}
    </div>
  );
}

function ConstraintCorrelationResult({ data }: { data: ConstraintCorrelationData }) {
  const significant = data.vendors.filter((v) => v.totalWithConstraint > 0 || v.totalWithout > 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Constraint: <span className="text-blue-400 font-mono">{data.constraint}</span>
      </p>
      <DataTable
        headers={["Vendor", "Win Rate (with)", "Win Rate (without)", "Delta", "N (with)", "N (without)"]}
        rows={significant.map((v) => [
          v.vendor,
          pct(v.winRateWith),
          pct(v.winRateWithout),
          `${v.delta > 0 ? "+" : ""}${pct(v.delta)}`,
          String(v.totalWithConstraint),
          String(v.totalWithout),
        ])}
      />
    </div>
  );
}

function PlatformComparisonResult({ data }: { data: PlatformComparisonData }) {
  const platformKeys = Object.keys(data.platforms);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        {data.groupType}: <span className="text-blue-400 font-mono">{data.groupKey}</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {platformKeys.map((platform) => {
          const p = data.platforms[platform];
          return (
            <div key={platform} className="bg-gray-700/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2">{platform}</h4>
              <p className="text-lg font-bold text-blue-400">{p.primaryVendor || "—"}</p>
              <p className="text-xs text-gray-500 mt-1">{p.responseCount} responses</p>
              {Object.keys(p.vendorCounts).length > 1 && (
                <div className="mt-2 space-y-1">
                  {Object.entries(p.vendorCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([vendor, count]) => (
                      <div key={vendor} className="flex justify-between text-xs text-gray-400">
                        <span>{vendor}</span>
                        <span>{count}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeadToHeadResult({ data }: { data: HeadToHeadData }) {
  const totalScenarios = data.aWins + data.bWins + data.ties;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-900/30 border border-green-800 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-400">{data.vendorA}</p>
          <p className="text-2xl font-bold text-green-400">{data.aWins}</p>
        </div>
        <div className="bg-gray-700/50 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-400">Ties</p>
          <p className="text-2xl font-bold text-gray-300">{data.ties}</p>
        </div>
        <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-400">{data.vendorB}</p>
          <p className="text-2xl font-bold text-blue-400">{data.bWins}</p>
        </div>
      </div>
      {data.scenarios.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            Scenarios ({totalScenarios})
          </h3>
          <DataTable
            headers={["Prompt", "Category", "Winner"]}
            rows={data.scenarios.slice(0, 20).map((s) => [
              s.prompt_id,
              s.category,
              s.winner || "—",
            ])}
          />
          {data.scenarios.length > 20 && (
            <p className="text-xs text-gray-500 mt-2">
              Showing 20 of {data.scenarios.length} scenarios
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PromptDifficultyResult({ data }: { data: PromptDifficultyData }) {
  const entropyLabel =
    data.entropy > 1.5 ? "Highly contested" : data.entropy > 0.8 ? "Moderately contested" : "Dominated";
  const entropyColor =
    data.entropy > 1.5 ? "text-red-400" : data.entropy > 0.8 ? "text-yellow-400" : "text-green-400";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Shannon Entropy" value={data.entropy.toFixed(2)} />
        <div className="bg-gray-700/50 rounded-lg p-3">
          <p className="text-xs text-gray-400">Contestedness</p>
          <p className={`text-lg font-bold mt-1 ${entropyColor}`}>{entropyLabel}</p>
        </div>
        <Stat label="Unique Vendors" value={String(data.vendorCount)} />
        <Stat label="Responses" value={String(data.responseCount)} />
      </div>
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-2">Vendor Distribution</h3>
        <div className="space-y-2">
          {Object.entries(data.vendorDistribution)
            .sort((a, b) => b[1] - a[1])
            .map(([vendor, count]) => {
              const pctVal = data.responseCount > 0 ? count / data.responseCount : 0;
              return (
                <div key={vendor} className="flex items-center gap-3">
                  <span className="text-sm text-gray-300 w-40 truncate">{vendor}</span>
                  <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all"
                      style={{ width: `${Math.round(pctVal * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-16 text-right">
                    {count} ({pct(pctVal)})
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function WhatIfResult({ data }: { data: WhatIfData }) {
  const deltaColor = data.delta > 0 ? "text-green-400" : data.delta < 0 ? "text-red-400" : "text-gray-400";
  const deltaPrefix = data.delta > 0 ? "+" : "";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Current Win Rate" value={pct(data.currentWinRate)} />
        <Stat label="Simulated Win Rate" value={pct(data.simulatedWinRate)} />
        <div className="bg-gray-700/50 rounded-lg p-3">
          <p className="text-xs text-gray-400">Delta</p>
          <p className={`text-lg font-bold mt-1 ${deltaColor}`}>
            {deltaPrefix}{pct(data.delta)}
          </p>
        </div>
        <Stat label="Simulated N" value={`${data.simulatedWins}/${data.simulatedTotal}`} />
      </div>
      <div className="text-sm text-gray-400 space-y-1">
        {data.addedConstraint && (
          <p>
            📎 Added constraint: <span className="text-blue-400 font-mono">{data.addedConstraint}</span>
          </p>
        )}
        {data.removedConstraint && (
          <p>
            🗑️ Removed constraint: <span className="text-red-400 font-mono">{data.removedConstraint}</span>
          </p>
        )}
        {!data.addedConstraint && !data.removedConstraint && (
          <p className="text-yellow-400">No constraint changes specified — results show baseline.</p>
        )}
      </div>
    </div>
  );
}

// ── Shared UI Components ────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-700/50 rounded-lg p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700">
            {headers.map((h) => (
              <th key={h} className="text-left py-2 px-3 text-gray-400 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-3 text-gray-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
