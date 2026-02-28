import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { searchCorpus } from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ error: "Query parameter 'q' is required (minimum 2 characters)" }, { status: 400 });
  }

  try {
    const parsed = parseInt(searchParams.get("limit") || "20", 10);
    const limit = Math.min(Number.isNaN(parsed) ? 20 : parsed, 100);
    const filters = {
      vendor: searchParams.get("vendor") || undefined,
      category: searchParams.get("category") || undefined,
      platform: searchParams.get("platform") || undefined,
      sourceType: searchParams.get("type") || undefined,
    };

    const results = await searchCorpus(q.trim(), filters, limit, auth.vendorCanonicalId);
    return NextResponse.json({ results, query: q, count: results.length });
  } catch (err) {
    console.error("/api/search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
