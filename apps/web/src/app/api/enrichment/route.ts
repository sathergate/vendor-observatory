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

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "summary";

  switch (view) {
    case "summary": {
      // Full prompt enrichment summaries with response stats
      const summaries = getPromptEnrichmentSummaries();
      return NextResponse.json({ summaries });
    }

    case "prompt-metadata": {
      // All prompt metadata or a specific prompt
      const promptId = searchParams.get("promptId");
      if (promptId) {
        const meta = getPromptMetadataById(promptId);
        const responses = getResponseContextByPrompt(promptId);
        return NextResponse.json({ metadata: meta, responses });
      }
      const allMeta = getPromptMetadata();
      return NextResponse.json({ metadata: allMeta });
    }

    case "vendor-leaderboard": {
      // Primary vendor recommendation counts with filters
      const category = searchParams.get("category") || undefined;
      const platform = searchParams.get("platform") || undefined;
      const contentTag = searchParams.get("contentTag") || undefined;
      const patternTag = searchParams.get("patternTag") || undefined;
      const counts = getPrimaryVendorCounts({ category, platform, contentTag, patternTag });
      return NextResponse.json({ vendorCounts: counts });
    }

    case "constraint-coverage": {
      // Constraint coverage stats
      const promptId = searchParams.get("promptId") || undefined;
      const coverage = getConstraintCoverage(promptId);
      return NextResponse.json({ coverage });
    }

    default:
      return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
  }
}
