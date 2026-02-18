import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { searchCorpus } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ error: "Query parameter 'q' is required (minimum 2 characters)" }, { status: 400 });
  }

  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
  const filters = {
    vendor: searchParams.get("vendor") || undefined,
    category: searchParams.get("category") || undefined,
    platform: searchParams.get("platform") || undefined,
    sourceType: searchParams.get("type") || undefined,
  };

  const results = searchCorpus(q.trim(), filters, limit);
  return NextResponse.json({ results, query: q, count: results.length });
}
