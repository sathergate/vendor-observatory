import { NextResponse } from "next/server";
import { getSessionList, getVendorScopedSessionList } from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";
import { vendorDisplayName, vendorCategory, getVendorIdsInCategory } from "@/lib/vendor-taxonomy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const limit = Math.min(Number.isNaN(rawLimit) ? 50 : Math.max(1, rawLimit), 200);
    const offset = Number.isNaN(rawOffset) ? 0 : Math.max(0, rawOffset);

    if (auth.vendorCanonicalId) {
      const vendorId = auth.vendorCanonicalId;
      const category = vendorCategory(vendorId);
      const categoryVendorIds = category ? getVendorIdsInCategory(category) : [vendorId];
      const name = vendorDisplayName(vendorId);
      return NextResponse.json(await getVendorScopedSessionList(vendorId, categoryVendorIds, name, limit, offset));
    }

    return NextResponse.json(await getSessionList(limit, offset, auth.vendorCanonicalId));
  } catch (err) {
    console.error("/api/sessions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
