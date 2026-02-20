import { NextResponse } from "next/server";
import { getBenchmarkStats, getBenchmarkSessions, getBenchmarkVendorComparison, getPrimaryVendorCounts, getPromptEnrichmentSummaries } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
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
