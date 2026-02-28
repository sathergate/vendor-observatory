import { Suspense } from "react";
import { Pool } from "pg";
import PaymentForm from "./PaymentForm";

/**
 * Look up the vendor associated with an onboarding job.
 * Resolves the job's domain to a vendor canonical_id via the vendors table.
 */
async function resolveVendorFromJob(
  jobId: string,
): Promise<{ vendorId: string; vendorName: string } | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const pool = new Pool({ connectionString });
  try {
    // Get domain and product name from the onboarding job
    const { rows: jobRows } = await pool.query<{
      domain: string;
      product_name: string | null;
    }>(
      "SELECT domain, product_name FROM onboarding_jobs WHERE id = $1",
      [jobId],
    );
    if (jobRows.length === 0) return null;
    const { domain, product_name } = jobRows[0];
    const domainPrefix = domain.split(".")[0];
    const name = product_name || domainPrefix;

    // Try matching against vendors: canonical_id, display_name, or synonyms
    const { rows: byId } = await pool.query<{ canonical_id: string; display_name: string }>(
      "SELECT canonical_id, display_name FROM vendors WHERE canonical_id = $1",
      [domainPrefix],
    );
    if (byId.length > 0) return { vendorId: byId[0].canonical_id, vendorName: byId[0].display_name };

    const { rows: byName } = await pool.query<{ canonical_id: string; display_name: string }>(
      "SELECT canonical_id, display_name FROM vendors WHERE LOWER(display_name) = LOWER($1)",
      [name],
    );
    if (byName.length > 0) return { vendorId: byName[0].canonical_id, vendorName: byName[0].display_name };

    const { rows: bySyn } = await pool.query<{ canonical_id: string; display_name: string }>(
      "SELECT canonical_id, display_name FROM vendors WHERE $1 = ANY(synonyms) OR $2 = ANY(synonyms) LIMIT 1",
      [domainPrefix.toLowerCase(), name.toLowerCase()],
    );
    if (bySyn.length > 0) return { vendorId: bySyn[0].canonical_id, vendorName: bySyn[0].display_name };

    return null;
  } catch {
    return null;
  } finally {
    await pool.end();
  }
}

export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; jobId?: string; canceled?: string }>;
}) {
  const { jobId } = await searchParams;

  // Resolve vendor from the onboarding job
  const resolved = jobId ? await resolveVendorFromJob(jobId) : null;

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-6 text-center">
        Complete your setup
      </h1>
      <Suspense
        fallback={
          <div className="text-center text-gray-400 py-8">Loading...</div>
        }
      >
        <PaymentForm
          vendorId={resolved?.vendorId ?? null}
          vendorName={resolved?.vendorName ?? null}
        />
      </Suspense>
    </div>
  );
}
