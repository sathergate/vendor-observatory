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
  rationale: { label: "Rationale", color: "bg-data-1" },
  trade_off: { label: "Trade-off", color: "bg-data-3" },
  gotcha: { label: "Gotcha", color: "bg-data-4" },
  context: { label: "Context", color: "bg-data-muted" },
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
  const [error, setError] = useState<string | null>(null);
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

    setError(null);
    try {
      const resp = await fetch(`/api/search?${params.toString()}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Search failed");
      setResults(data.results || []);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Search failed. Please try again.");
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

  const selectClass = "rounded-[6px] bg-raised border-border text-primary px-3 py-1.5 text-[12px] focus:ring-accent focus:border-accent";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-bold text-primary">Semantic Search</h1>
        <p className="text-secondary mt-1">
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
            className="flex-1 rounded-[6px] bg-surface border border-border text-primary px-4 py-2.5 text-[14px] focus:ring-accent focus:border-accent placeholder-muted"
          />
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="px-5 py-2.5 rounded-[6px] bg-accent hover:bg-accent/80 disabled:bg-raised disabled:text-muted disabled:cursor-not-allowed text-[14px] font-medium transition-colors text-primary"
          >
            {loading ? "Searching\u2026" : "Search"}
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

      {/* Error Banner */}
      {error && (
        <div className="rounded-[6px] bg-data-4/10 border border-data-4/30 px-4 py-3 text-[14px] text-data-4">
          {error}
        </div>
      )}

      {/* Results */}
      {searched && !error && (
        <div className="space-y-3">
          <p className="text-[14px] text-secondary">
            {results.length === 0
              ? "No results found"
              : `${results.length.toLocaleString()} result${results.length === 1 ? "" : "s"} found`}
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
    color: "bg-data-muted",
  };

  return (
    <div className="bg-surface rounded-[6px] p-4 border border-border hover:bg-raised transition-colors">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded-[6px] text-[12px] font-medium text-primary ${typeInfo.color}`}>
          {typeInfo.label}
        </span>
        {result.vendor && (
          <Link
            href={`/benchmarks/vendors/${result.vendor}`}
            className="px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-accent/15 text-accent hover:bg-accent/25"
          >
            {result.vendor}
          </Link>
        )}
        {result.category && (
          <span className="px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-data-1/15 text-data-1">
            {result.category}
          </span>
        )}
        {result.platform && (
          <span className="px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-raised text-secondary">
            {PLATFORM_LABELS[result.platform] ?? result.platform}
          </span>
        )}
      </div>
      <p
        className="text-[14px] text-primary leading-relaxed"
        dangerouslySetInnerHTML={{ __html: result.snippet }}
      />
      <p className="text-[12px] text-muted mt-2">
        Prompt: {result.prompt_id}
      </p>
    </div>
  );
}
