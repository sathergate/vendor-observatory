"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

export type DataSource = "benchmark" | "organic" | "all";

export function DataSourceSelector() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = (searchParams.get("data_source") as DataSource) || "all";

  const setSource = (source: DataSource) => {
    const params = new URLSearchParams(searchParams.toString());
    if (source === "all") params.delete("data_source");
    else params.set("data_source", source);
    router.push(`${pathname}?${params.toString()}`);
  };

  const options: { value: DataSource; label: string }[] = [
    { value: "all", label: "All Sources" },
    { value: "benchmark", label: "Benchmark" },
    { value: "organic", label: "Organic" },
  ];

  return (
    <div className="flex items-center gap-1 bg-surface rounded-[6px] border border-border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setSource(opt.value)}
          className={`px-3 py-1.5 rounded-[4px] text-[12px] font-medium transition-colors ${
            current === opt.value
              ? "bg-raised text-primary"
              : "text-muted hover:text-secondary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function DataSourceBadge({ source }: { source: DataSource }) {
  const label =
    source === "all"
      ? "All Sources"
      : source === "benchmark"
        ? "Benchmark"
        : "Organic";
  const color =
    source === "benchmark"
      ? "text-data-1"
      : source === "organic"
        ? "text-data-5"
        : "text-secondary";
  return (
    <span
      className={`text-[11px] font-medium ${color} px-1.5 py-0.5 rounded-[4px] bg-raised`}
    >
      {label}
    </span>
  );
}
