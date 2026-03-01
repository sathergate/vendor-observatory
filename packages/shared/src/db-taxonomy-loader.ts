/**
 * Database-backed vendor taxonomy and package-map loaders.
 *
 * These functions query the `vendors` table (which contains package_names)
 * to build VendorTaxonomy and package-to-vendor maps at runtime, replacing
 * the static YAML taxonomy and hardcoded package-map.ts.
 *
 * Accepts a generic query function so the shared package doesn't need a
 * direct dependency on `pg`.
 */

import type { VendorTaxonomy, VendorEntry } from "./types.js";

/** Minimal query interface — compatible with pg.Pool and pg.Client. */
export interface DbQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Load the full vendor taxonomy from the `vendors` database table.
 * Returns the same VendorTaxonomy shape as loadVendorTaxonomy() from YAML.
 */
export async function loadVendorTaxonomyFromDb(
  db: DbQueryable,
): Promise<VendorTaxonomy> {
  const { rows } = await db.query(
    "SELECT canonical_id, display_name, category, synonyms FROM vendors ORDER BY canonical_id",
  );

  if (rows.length === 0) {
    throw new Error("No vendors found in database. Run migrate-taxonomy.ts first.");
  }

  const vendors: VendorEntry[] = rows.map((r) => ({
    canonical_id: r.canonical_id as string,
    display_name: r.display_name as string,
    category: r.category as string,
    synonyms: (r.synonyms as string[]) ?? [],
  }));

  return { vendors };
}

/**
 * Load the package-to-vendor map from the `vendors` database table.
 * Returns a Record<packageName, vendorCanonicalId> — the same shape as
 * the static PACKAGE_TO_VENDOR constant in package-map.ts.
 */
export async function loadPackageMapFromDb(
  db: DbQueryable,
): Promise<Record<string, string>> {
  const { rows } = await db.query(
    "SELECT canonical_id, package_names FROM vendors WHERE array_length(package_names, 1) > 0",
  );

  const map: Record<string, string> = {};
  for (const row of rows) {
    const vendorId = row.canonical_id as string;
    const pkgNames = row.package_names as string[];
    for (const pkg of pkgNames) {
      map[pkg] = vendorId;
    }
  }

  return map;
}

/**
 * Create a resolvePackageToVendor function backed by a database-loaded map.
 * Drop-in replacement for the static resolvePackageToVendor().
 */
export function createPackageResolver(
  packageMap: Record<string, string>,
): (packageName: string) => string | null {
  return (packageName: string): string | null => {
    // Strip version specifiers: @supabase/supabase-js@2.0.0 → @supabase/supabase-js
    const cleaned = packageName.replace(/@[\d^~>=<.*]+$/, "");
    return packageMap[cleaned] ?? null;
  };
}
