import { NextResponse } from "next/server";
import { getBenchmarkStats, getBenchmarkSessions, getBenchmarkVendorComparison, getPrimaryVendorCounts, getPromptEnrichmentSummaries } from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;

  try {
    const stats = await getBenchmarkStats();
    const sessions = await getBenchmarkSessions(100);
    const vendorComparison = await getBenchmarkVendorComparison();
    const primaryVendorCounts = await getPrimaryVendorCounts();
    const enrichmentSummaries = await getPromptEnrichmentSummaries();
    return NextResponse.json({ stats, sessions, vendorComparison, primaryVendorCounts, enrichmentSummaries });
  } catch (err) {
    console.error("/api/benchmarks error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
