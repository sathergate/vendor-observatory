import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getPromptMetadata,
  getPromptMetadataById,
  getPrimaryVendorCounts,
  getConstraintCoverage,
  getPromptEnrichmentSummaries,
  getResponseContextByPrompt,
} from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "summary";

  try {
    switch (view) {
      case "summary": {
        const summaries = await getPromptEnrichmentSummaries();
        return NextResponse.json({ summaries });
      }

      case "prompt-metadata": {
        const promptId = searchParams.get("promptId");
        if (promptId) {
          const meta = await getPromptMetadataById(promptId);
          const responses = await getResponseContextByPrompt(promptId);
          return NextResponse.json({ metadata: meta, responses });
        }
        const allMeta = await getPromptMetadata();
        return NextResponse.json({ metadata: allMeta });
      }

      case "vendor-leaderboard": {
        const category = searchParams.get("category") || undefined;
        const platform = searchParams.get("platform") || undefined;
        const contentTag = searchParams.get("contentTag") || undefined;
        const patternTag = searchParams.get("patternTag") || undefined;
        const counts = await getPrimaryVendorCounts({ category, platform, contentTag, patternTag });
        return NextResponse.json({ vendorCounts: counts });
      }

      case "constraint-coverage": {
        const promptId = searchParams.get("promptId") || undefined;
        const coverage = await getConstraintCoverage(promptId);
        return NextResponse.json({ coverage });
      }

      default:
        return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
    }
  } catch (err) {
    console.error("/api/enrichment error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
