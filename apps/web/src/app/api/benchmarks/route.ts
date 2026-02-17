import { NextResponse } from "next/server";
import { getBenchmarkStats, getBenchmarkSessions, getBenchmarkVendorComparison, getPrimaryVendorCounts, getPromptEnrichmentSummaries } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getBenchmarkStats();
  const sessions = getBenchmarkSessions(100);
  const vendorComparison = getBenchmarkVendorComparison();
  const primaryVendorCounts = getPrimaryVendorCounts();
  const enrichmentSummaries = getPromptEnrichmentSummaries();
  return NextResponse.json({ stats, sessions, vendorComparison, primaryVendorCounts, enrichmentSummaries });
}
