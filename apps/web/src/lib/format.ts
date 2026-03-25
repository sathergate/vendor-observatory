/**
 * Format a percentage point delta as "+11pp" / "-26pp".
 * Uses percentage points (pp) — the correct unit for comparing rates.
 */
export function ppDelta(val: number): string {
  const rounded = Math.round(val);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}pp`;
}

/**
 * Format a rate as "33%" (whole number).
 */
export function pctWhole(val: number): string {
  return `${Math.round(val)}%`;
}

/**
 * Format a rate as "33.1%" (one decimal).
 */
export function pct(val: number): string {
  return `${val.toFixed(1)}%`;
}
