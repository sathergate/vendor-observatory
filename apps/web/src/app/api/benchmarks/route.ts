import { NextResponse } from "next/server";
import { getBenchmarkStats, getBenchmarkSessions, getBenchmarkVendorComparison } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getBenchmarkStats();
  const sessions = getBenchmarkSessions(100);
  const vendorComparison = getBenchmarkVendorComparison();
  return NextResponse.json({ stats, sessions, vendorComparison });
}
