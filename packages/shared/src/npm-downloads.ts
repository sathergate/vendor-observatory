/**
 * Fetches npm download counts for packages via the public npm registry API.
 * No authentication required — the npm API is public and rate-limited at ~100 req/s.
 *
 * Usage:
 *   import { fetchNpmDownloads, fetchBulkNpmDownloads } from "@sathergate/vendor-observatory-shared";
 *   const downloads = await fetchNpmDownloads("flagpost");
 *   const bulk = await fetchBulkNpmDownloads(["flagpost", "pressroom"]);
 */

export interface NpmDownloadPoint {
  /** npm package name */
  package: string;
  /** Weekly download count */
  weekly: number;
  /** Monthly download count (last 30 days) */
  monthly: number;
  /** Fetched at timestamp */
  fetchedAt: string;
}

export interface NpmDownloadComparison {
  vendor_canonical_id: string;
  npm_package: string;
  weekly_downloads: number;
  monthly_downloads: number;
  mention_rate?: number;
  /** Downloads per mention — high = under-recommended, low = over-recommended */
  downloads_per_mention?: number;
}

/**
 * Fetch download counts for a single npm package.
 * Uses the public npm API: https://api.npmjs.org/downloads/point/{period}/{package}
 */
export async function fetchNpmDownloads(packageName: string): Promise<NpmDownloadPoint> {
  const [weeklyRes, monthlyRes] = await Promise.all([
    fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`),
    fetch(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(packageName)}`),
  ]);

  const weekly = weeklyRes.ok ? ((await weeklyRes.json()) as { downloads: number }).downloads : 0;
  const monthly = monthlyRes.ok ? ((await monthlyRes.json()) as { downloads: number }).downloads : 0;

  return {
    package: packageName,
    weekly,
    monthly,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetch download counts for multiple npm packages in parallel.
 * Batches requests to stay under npm's rate limit.
 */
export async function fetchBulkNpmDownloads(
  packageNames: string[],
): Promise<NpmDownloadPoint[]> {
  // Process in batches of 20 to be polite to the npm API
  const BATCH_SIZE = 20;
  const results: NpmDownloadPoint[] = [];

  for (let i = 0; i < packageNames.length; i += BATCH_SIZE) {
    const batch = packageNames.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(fetchNpmDownloads));
    results.push(...batchResults);
  }

  return results;
}

/**
 * Build a mapping from vendor canonical IDs to their npm package names.
 * Inverts the PACKAGE_TO_VENDOR map so we can look up packages by vendor.
 */
export function buildVendorToPackagesMap(
  packageToVendor: Record<string, string>,
): Map<string, string[]> {
  const vendorToPackages = new Map<string, string[]>();
  for (const [pkg, vendor] of Object.entries(packageToVendor)) {
    const existing = vendorToPackages.get(vendor) ?? [];
    existing.push(pkg);
    vendorToPackages.set(vendor, existing);
  }
  return vendorToPackages;
}

/**
 * Fetch npm download stats for the agentic product suite.
 * Returns one download point per product canonical ID.
 */
export async function fetchAgenticProductSuiteDownloads(
  productPackages: Record<string, string>,
): Promise<Map<string, NpmDownloadPoint>> {
  const packageToProduct = Object.fromEntries(
    Object.entries(productPackages).map(([product, packageName]) => [packageName, product]),
  );

  return fetchVendorNpmDownloads(packageToProduct);
}

/**
 * Fetch npm download stats for all tracked vendors.
 * Returns aggregated downloads per vendor (sum of all their packages).
 */
export async function fetchVendorNpmDownloads(
  packageToVendor: Record<string, string>,
): Promise<Map<string, NpmDownloadPoint>> {
  const vendorToPackages = buildVendorToPackagesMap(packageToVendor);
  const allPackages = Object.keys(packageToVendor);
  const downloads = await fetchBulkNpmDownloads(allPackages);

  // Aggregate by vendor
  const vendorDownloads = new Map<string, NpmDownloadPoint>();
  for (const dl of downloads) {
    const vendor = packageToVendor[dl.package];
    if (!vendor) continue;

    const existing = vendorDownloads.get(vendor);
    if (existing) {
      existing.weekly += dl.weekly;
      existing.monthly += dl.monthly;
    } else {
      vendorDownloads.set(vendor, {
        package: vendorToPackages.get(vendor)?.join(", ") ?? dl.package,
        weekly: dl.weekly,
        monthly: dl.monthly,
        fetchedAt: dl.fetchedAt,
      });
    }
  }

  return vendorDownloads;
}
