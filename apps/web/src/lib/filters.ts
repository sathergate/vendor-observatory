export interface FilterState {
  vendor?: string;
  competitor?: string;
  constraint?: string;
  platform?: string;
  timeframe?: string;
  dataSource?: "benchmark" | "organic" | "all";
}

export function filtersToSearchParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.vendor) params.set("vendor", filters.vendor);
  if (filters.competitor) params.set("competitor", filters.competitor);
  if (filters.constraint) params.set("constraint", filters.constraint);
  if (filters.platform) params.set("platform", filters.platform);
  if (filters.timeframe) params.set("timeframe", filters.timeframe);
  if (filters.dataSource && filters.dataSource !== "all") params.set("data_source", filters.dataSource);
  return params;
}

export function searchParamsToFilters(params: URLSearchParams): FilterState {
  return {
    vendor: params.get("vendor") || undefined,
    competitor: params.get("competitor") || undefined,
    constraint: params.get("constraint") || undefined,
    platform: params.get("platform") || undefined,
    timeframe: params.get("timeframe") || undefined,
    dataSource: (params.get("data_source") as FilterState["dataSource"]) || undefined,
  };
}

export function filtersToQueryString(filters: FilterState): string {
  const params = filtersToSearchParams(filters);
  const str = params.toString();
  return str ? `?${str}` : "";
}
