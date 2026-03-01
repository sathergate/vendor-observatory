import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getRejectionSummary,
  getRejectionDetails,
  getRejectionReasonBreakdown,
  getAlternativeFlows,
} from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "summary";
  const vendorId = searchParams.get("vendor") || undefined;

  const vs = auth.vendorCanonicalId;

  try {
    switch (view) {
      case "summary": {
        const summary = await getRejectionSummary(vs);
        return NextResponse.json({ summary });
      }

      case "details": {
        const limit = parseInt(searchParams.get("limit") || "100", 10);
        const details = await getRejectionDetails(vendorId, limit);
        return NextResponse.json({ details });
      }

      case "reasons": {
        const breakdown = await getRejectionReasonBreakdown(vendorId);
        return NextResponse.json({ breakdown });
      }

      case "alternatives": {
        const flows = await getAlternativeFlows(vs);
        return NextResponse.json({ flows });
      }

      default:
        return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
    }
  } catch (err) {
    console.error("/api/rejections error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
