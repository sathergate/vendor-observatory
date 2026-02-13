import { NextResponse } from "next/server";
import { getVendorStats } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const vendors = getVendorStats(platform, category);
  return NextResponse.json(vendors);
}
