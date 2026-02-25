import { Pool } from "pg";

/**
 * Ensure a vendor exists in the vendors table.
 * If the product doesn't match any existing vendor, create a dynamic entry.
 *
 * Returns the canonical_id of the matched or newly created vendor.
 */
export async function ensureVendor(
  productName: string,
  domain: string,
  category: string,
  pool: Pool,
): Promise<string> {
  const domainRoot = domain.replace(/^www\./, "").split(".")[0].toLowerCase();

  // 1. Check canonical_id matches domain root
  const { rows: byId } = await pool.query(
    "SELECT canonical_id FROM vendors WHERE canonical_id = $1",
    [domainRoot]
  );
  if (byId.length > 0) return byId[0].canonical_id;

  // 2. Check for unknown/<domain> entry
  const unknownId = `unknown/${domain}`;
  const { rows: byUnknown } = await pool.query(
    "SELECT canonical_id FROM vendors WHERE canonical_id = $1",
    [unknownId]
  );
  if (byUnknown.length > 0) return byUnknown[0].canonical_id;

  // 3. Check display_name match
  const { rows: byName } = await pool.query(
    "SELECT canonical_id FROM vendors WHERE LOWER(display_name) = LOWER($1)",
    [productName]
  );
  if (byName.length > 0) return byName[0].canonical_id;

  // 4. Check synonyms
  const { rows: bySyn } = await pool.query(
    "SELECT canonical_id FROM vendors WHERE $1 = ANY(synonyms) OR $2 = ANY(synonyms) LIMIT 1",
    [domainRoot, productName.toLowerCase()]
  );
  if (bySyn.length > 0) return bySyn[0].canonical_id;

  // 5. No match — create dynamic entry
  const synonyms = generateSynonyms(productName, domain);

  await pool.query(`
    INSERT INTO vendors (canonical_id, display_name, category, synonyms, package_names, is_dynamic)
    VALUES ($1, $2, $3, $4, '{}', TRUE)
    ON CONFLICT(canonical_id) DO NOTHING
  `, [unknownId, productName, category, synonyms]);

  console.log(`[vendor-mapper] Created dynamic vendor: ${unknownId} (${productName})`);
  return unknownId;
}

/**
 * Generate synonyms from product name and domain.
 * e.g., "Acme DB" → ["acme db", "acme-db", "acmedb", "acme"]
 */
function generateSynonyms(productName: string, domain: string): string[] {
  const synonyms = new Set<string>();
  const lower = productName.toLowerCase();

  synonyms.add(lower);
  synonyms.add(lower.replace(/\s+/g, "-"));
  synonyms.add(lower.replace(/\s+/g, ""));

  // Individual words (if multi-word)
  const words = lower.split(/\s+/);
  if (words.length > 1) {
    synonyms.add(words[0]);
  }

  // Domain root
  const domainRoot = domain.replace(/^www\./, "").split(".")[0].toLowerCase();
  synonyms.add(domainRoot);

  return [...synonyms];
}
