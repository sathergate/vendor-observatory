import { NextResponse } from "next/server";
import { getBenchmarkStats, getBenchmarkSessions, getBenchmarkVendorComparison, getPrimaryVendorCounts, getPromptEnrichmentSummaries } from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;

  try {
    const vs = auth.vendorCanonicalId;
    const stats = await getBenchmarkStats(vs);
    const sessions = await getBenchmarkSessions(100, vs);
    const vendorComparison = await getBenchmarkVendorComparison(vs);
    const primaryVendorCounts = await getPrimaryVendorCounts({ vendorScope: vs });
    const enrichmentSummaries = await getPromptEnrichmentSummaries(vs);
    return NextResponse.json({ stats, sessions, vendorComparison, primaryVendorCounts, enrichmentSummaries });
  } catch (err) {
    console.error("/api/benchmarks error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
