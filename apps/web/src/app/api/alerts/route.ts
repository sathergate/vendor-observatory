import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getLatestDigests } from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const limitStr = searchParams.get("limit") || "10";
  const parsed = parseInt(limitStr, 10);
  const limit = Math.min(Number.isNaN(parsed) ? 10 : parsed, 50);

  try {
    const digests = await getLatestDigests(limit);
    return NextResponse.json({ digests });
  } catch (err) {
    console.error("/api/alerts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
