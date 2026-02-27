import { NextResponse } from "next/server";
import { getVendorStats } from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const platform = url.searchParams.get("platform") ?? undefined;
    const category = url.searchParams.get("category") ?? undefined;
    const vendors = await getVendorStats(platform, category);
    return NextResponse.json(vendors);
  } catch (err) {
    console.error("/api/vendors error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
