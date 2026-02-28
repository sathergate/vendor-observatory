import { Suspense } from "react";
import { Pool } from "pg";
import PaymentForm from "./PaymentForm";

async function getVendorList(): Promise<Array<{ canonical_id: string; display_name: string }>> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return [];
  const pool = new Pool({ connectionString });
  try {
    const { rows } = await pool.query<{ canonical_id: string; display_name: string }>(
      "SELECT canonical_id, display_name FROM vendors ORDER BY display_name",
    );
    return rows;
  } catch {
    return [];
  } finally {
    await pool.end();
  }
}

export default async function PaymentPage() {
  const vendors = await getVendorList();

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
        <PaymentForm vendors={vendors} />
      </Suspense>
    </div>
  );
}
