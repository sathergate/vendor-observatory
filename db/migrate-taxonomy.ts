#!/usr/bin/env npx tsx
/**
 * One-time migration: reads taxonomy/vendors.yaml and packages/shared/src/package-map.ts
 * data, then inserts all vendors into the `vendors` PostgreSQL table.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx db/migrate-taxonomy.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import pg from "pg";

const { Pool } = pg;

interface VendorEntry {
  canonical_id: string;
  display_name: string;
  synonyms: string[];
  category: string;
  website?: string;
}

interface VendorTaxonomy {
  vendors: VendorEntry[];
}

// ── Load package-map data ──────────────────────────────────────────
// We invert the map: vendor → package_names[]
function loadPackageMap(): Record<string, string[]> {
  // Import is tricky in a standalone script, so we parse the source directly
  const mapPath = resolve(process.cwd(), "packages/shared/src/package-map.ts");
  const src = readFileSync(mapPath, "utf-8");

  const vendorPackages: Record<string, string[]> = {};
  const lineRegex = /^\s*"([^"]+)":\s*"([^"]+)"/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(src)) !== null) {
    const pkgName = m[1];
    const vendorId = m[2];
    if (!vendorPackages[vendorId]) vendorPackages[vendorId] = [];
    vendorPackages[vendorId].push(pkgName);
  }
  return vendorPackages;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  // Load taxonomy
  const taxonomyPath = resolve(process.cwd(), "taxonomy/vendors.yaml");
  const raw = readFileSync(taxonomyPath, "utf-8");
  const taxonomy = parseYaml(raw) as VendorTaxonomy;
  console.log(`Loaded ${taxonomy.vendors.length} vendors from taxonomy`);

  // Load package map
  const packageMap = loadPackageMap();
  console.log(`Loaded package mappings for ${Object.keys(packageMap).length} vendors`);

  const pool = new Pool({ connectionString: dbUrl });

  // Create vendors table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendors (
      canonical_id    TEXT PRIMARY KEY,
      display_name    TEXT NOT NULL,
      category        TEXT NOT NULL,
      synonyms        TEXT[] NOT NULL DEFAULT '{}',
      package_names   TEXT[] NOT NULL DEFAULT '{}',
      is_dynamic      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS vendors_synonyms_gin ON vendors USING GIN(synonyms)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vendors_package_names_gin ON vendors USING GIN(package_names)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vendors_category ON vendors(category)`);

  console.log("Vendors table ready");

  // Insert vendors
  let inserted = 0;
  let updated = 0;
  for (const v of taxonomy.vendors) {
    const pkgNames = packageMap[v.canonical_id] ?? [];

    const result = await pool.query(`
      INSERT INTO vendors (canonical_id, display_name, category, synonyms, package_names, is_dynamic)
      VALUES ($1, $2, $3, $4, $5, FALSE)
      ON CONFLICT(canonical_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        category = EXCLUDED.category,
        synonyms = EXCLUDED.synonyms,
        package_names = EXCLUDED.package_names
      RETURNING (xmax = 0) AS is_insert
    `, [v.canonical_id, v.display_name, v.category, v.synonyms, pkgNames]);

    if (result.rows[0]?.is_insert) {
      inserted++;
    } else {
      updated++;
    }
  }

  console.log(`Done: ${inserted} inserted, ${updated} updated`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
