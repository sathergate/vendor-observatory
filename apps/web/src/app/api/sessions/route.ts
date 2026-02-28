import { NextResponse } from "next/server";
import { getSessionList } from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const limit = Math.min(Number.isNaN(rawLimit) ? 50 : Math.max(1, rawLimit), 200);
    const offset = Number.isNaN(rawOffset) ? 0 : Math.max(0, rawOffset);
    return NextResponse.json(await getSessionList(limit, offset, auth.vendorCanonicalId));
  } catch (err) {
    console.error("/api/sessions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
