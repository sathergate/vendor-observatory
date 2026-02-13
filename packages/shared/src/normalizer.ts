import type { VendorTaxonomy } from "./types.js";

/**
 * Map a raw vendor name to its canonical_id in the taxonomy.
 *
 * Resolution order:
 *  1. Exact match on canonical_id
 *  2. Exact match on display_name
 *  3. Exact match on any synonym
 *  4. Case-insensitive includes on canonical_id, display_name, or synonyms
 *
 * Returns "unknown" if no match is found.
 */
export function normalizeVendorName(
  raw: string,
  taxonomy: VendorTaxonomy
): string {
  const trimmed = raw.trim();
  if (!trimmed) return "unknown";

  // Pass 1: exact matches (case-sensitive)
  for (const vendor of taxonomy.vendors) {
    if (vendor.canonical_id === trimmed) return vendor.canonical_id;
    if (vendor.display_name === trimmed) return vendor.canonical_id;
    for (const synonym of vendor.synonyms) {
      if (synonym === trimmed) return vendor.canonical_id;
    }
  }

  // Pass 2: case-insensitive substring matching
  const lower = trimmed.toLowerCase();
  for (const vendor of taxonomy.vendors) {
    if (vendor.canonical_id.toLowerCase().includes(lower))
      return vendor.canonical_id;
    if (vendor.display_name.toLowerCase().includes(lower))
      return vendor.canonical_id;
    for (const synonym of vendor.synonyms) {
      if (synonym.toLowerCase().includes(lower)) return vendor.canonical_id;
    }
  }

  return "unknown";
}
