export type DataSource = "benchmark" | "organic" | "all";

export function dataSourceFilter(alias: string = "s"): string {
  return `AND ${alias}.is_benchmark = $DATA_SOURCE_VAL`;
}

export function dataSourceCondition(
  source: DataSource,
  alias: string = "s",
): { sql: string; params: unknown[] } {
  if (source === "benchmark")
    return { sql: `AND ${alias}.is_benchmark = TRUE`, params: [] };
  if (source === "organic")
    return { sql: `AND ${alias}.is_benchmark = FALSE`, params: [] };
  return { sql: "", params: [] };
}
