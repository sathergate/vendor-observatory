"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";

interface SearchResult {
  source_type: string;
  source_id: string;
  vendor: string;
  category: string;
  platform: string;
  prompt_id: string;
  snippet: string;
  rank: number;
}

interface AutocompleteData {
  vendors: string[];
  categories: string[];
  constraints: string[];
  platforms: string[];
}

const SOURCE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  rationale: { label: "Rationale", color: "bg-blue-600" },
  trade_off: { label: "Trade-off", color: "bg-yellow-600" },
  gotcha: { label: "Gotcha", color: "bg-red-600" },
  context: { label: "Context", color: "bg-gray-600" },
};

const PLATFORM_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex_cli: "Codex CLI",
  cursor: "Cursor",
  cursor_agent: "Cursor",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [vendorFilter, setVendorFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [autocomplete, setAutocomplete] = useState<AutocompleteData | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load autocomplete data on mount
  useEffect(() => {
    fetch("/api/query?type=autocomplete")
      .then((r) => r.json())
      .then((data) => setAutocomplete(data.result ?? data))
      .catch(() => {});
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) return;
    setLoading(true);
    setSearched(true);

    const params = new URLSearchParams({ q: q.trim() });
    if (vendorFilter) params.set("vendor", vendorFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (platformFilter) params.set("platform", platformFilter);
    if (typeFilter) params.set("type", typeFilter);

    try {
      const resp = await fetch(`/api/search?${params.toString()}`);
      const data = await resp.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [vendorFilter, categoryFilter, platformFilter, typeFilter]);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim().length >= 2) search(value);
    }, 300);
  }, [search]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    search(query);
  }, [query, search]);

  const selectClass = "rounded-md bg-gray-700 border-gray-600 text-white px-3 py-1.5 text-xs focus:ring-blue-500";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Semantic Search</h1>
        <p className="text-gray-400 mt-1">
          Full-text search across rationale snippets, trade-offs, and gotchas
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search for serverless, connection pooling, HIPAA compliance..."
            className="flex-1 rounded-md bg-gray-800 border-gray-700 text-white px-4 py-2.5 text-sm focus:ring-blue-500 focus:border-blue-500 placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="px-5 py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap gap-2">
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className={selectClass}
          >
            <option value="">All vendors</option>
            {(autocomplete?.vendors ?? []).map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={selectClass}
          >
            <option value="">All categories</option>
            {(autocomplete?.categories ?? []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className={selectClass}
          >
            <option value="">All platforms</option>
            {(autocomplete?.platforms ?? []).map((p) => (
              <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={selectClass}
          >
            <option value="">All types</option>
            <option value="rationale">Rationale</option>
            <option value="trade_off">Trade-off</option>
            <option value="gotcha">Gotcha</option>
          </select>
        </div>
      </form>

      {/* Results */}
      {searched && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            {results.length === 0
              ? "No results found"
              : `${results.length} result${results.length === 1 ? "" : "s"} found`}
          </p>
          {results.map((r) => (
            <ResultCard key={r.source_id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: SearchResult }) {
  const typeInfo = SOURCE_TYPE_LABELS[result.source_type] || {
    label: result.source_type,
    color: "bg-gray-600",
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700/80 transition-colors">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${typeInfo.color}`}>
          {typeInfo.label}
        </span>
        {result.vendor && (
          <Link
            href={`/benchmarks/vendors/${result.vendor}`}
            className="px-2 py-0.5 rounded text-xs font-medium bg-blue-900/50 text-blue-300 hover:bg-blue-800/50"
          >
            {result.vendor}
          </Link>
        )}
        {result.category && (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-900/50 text-purple-300">
            {result.category}
          </span>
        )}
        {result.platform && (
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            result.platform === "claude_code" ? "bg-blue-900/50 text-blue-300"
            : result.platform === "codex_cli" ? "bg-green-900/50 text-green-300"
            : "bg-purple-900/50 text-purple-300"
          }`}>
            {PLATFORM_LABELS[result.platform] ?? result.platform}
          </span>
        )}
      </div>
      <p
        className="text-sm text-gray-300 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: result.snippet }}
      />
      <p className="text-xs text-gray-500 mt-2">
        Prompt: {result.prompt_id}
      </p>
    </div>
  );
}
