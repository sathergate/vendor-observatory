import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { getCurrentUser, setSubscriptionVendor } from "@/lib/auth";

/** Validate that a vendor canonical_id exists in the vendors table. */
async function isValidVendor(vendorId: string): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return false;
  const pool = new Pool({ connectionString });
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM vendors WHERE canonical_id = $1",
      [vendorId],
    );
    return rows.length > 0;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

/**
 * POST /api/account/vendor
 * One-time vendor set for subscribers whose vendor_canonical_id is NULL.
 * Body: { vendorId: string }
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { vendorId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { vendorId } = body;
  if (!vendorId || typeof vendorId !== "string") {
    return NextResponse.json(
      { error: "Missing required field: vendorId" },
      { status: 400 },
    );
  }

  const valid = await isValidVendor(vendorId);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid vendor. Please choose a valid vendor canonical ID." },
      { status: 400 },
    );
  }

  const result = await setSubscriptionVendor(user.id, vendorId);

  switch (result) {
    case "ok":
      return NextResponse.json({ success: true, vendorCanonicalId: vendorId });
    case "already_set":
      return NextResponse.json(
        { error: "Vendor already set. Contact support to change your vendor." },
        { status: 409 },
      );
    case "no_subscription":
      return NextResponse.json(
        { error: "No active subscription found. Please subscribe first." },
        { status: 403 },
      );
  }
}
