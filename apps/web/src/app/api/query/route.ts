import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  queryVendorWinRate,
  queryConstraintCorrelation,
  queryPlatformComparison,
  queryPromptDifficulty,
  queryWhatIf,
  getQueryAutocompleteData,
} from "@/lib/query-engine";
import { getVendorHeadToHead } from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;
  const vs = auth.vendorCanonicalId;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (!type) {
    return NextResponse.json({ error: "Missing required parameter: type" }, { status: 400 });
  }

  try {
    switch (type) {
      case "autocomplete": {
        const data = await getQueryAutocompleteData();
        return NextResponse.json(data);
      }

      case "vendorWinRate": {
        // Use the subscriber's linked vendor (ignore client-supplied vendor param)
        const vendor = vs || searchParams.get("vendor");
        if (!vendor) {
          return NextResponse.json({ error: "Missing required parameter: vendor" }, { status: 400 });
        }
        const result = await queryVendorWinRate(vendor, {
          category: searchParams.get("category") || undefined,
          platform: searchParams.get("platform") || undefined,
          constraint: searchParams.get("constraint") || undefined,
        });
        return NextResponse.json({ result });
      }

      case "constraintCorrelation": {
        const constraint = searchParams.get("constraint");
        if (!constraint) {
          return NextResponse.json({ error: "Missing required parameter: constraint" }, { status: 400 });
        }
        const result = await queryConstraintCorrelation(constraint);
        return NextResponse.json({ result });
      }

      case "platformComparison": {
        const key = searchParams.get("key");
        if (!key) {
          return NextResponse.json({ error: "Missing required parameter: key (prompt_id or category)" }, { status: 400 });
        }
        const keyType = (searchParams.get("keyType") || "prompt") as "prompt" | "category";
        const result = await queryPlatformComparison(key, keyType);
        return NextResponse.json({ result });
      }

      case "headToHead": {
        // One of the vendors must be the subscriber's linked vendor
        const vendorA = vs || searchParams.get("vendorA");
        const vendorB = searchParams.get("vendorB") || searchParams.get("vendorA");
        if (!vendorA || !vendorB) {
          return NextResponse.json({ error: "Missing required parameters: vendorA, vendorB" }, { status: 400 });
        }
        const result = await getVendorHeadToHead(vendorA, vendorB);
        return NextResponse.json({ result });
      }

      case "promptDifficulty": {
        const promptId = searchParams.get("promptId");
        if (!promptId) {
          return NextResponse.json({ error: "Missing required parameter: promptId" }, { status: 400 });
        }
        const result = await queryPromptDifficulty(promptId);
        return NextResponse.json({ result });
      }

      case "whatIf": {
        // Use the subscriber's linked vendor
        const vendor = vs || searchParams.get("vendor");
        if (!vendor) {
          return NextResponse.json({ error: "Missing required parameter: vendor" }, { status: 400 });
        }
        const result = await queryWhatIf(
          vendor,
          searchParams.get("addConstraint") || undefined,
          searchParams.get("removeConstraint") || undefined,
        );
        return NextResponse.json({ result });
      }

      default:
        return NextResponse.json(
          { error: `Unknown query type: ${type}. Valid types: autocomplete, vendorWinRate, constraintCorrelation, platformComparison, headToHead, promptDifficulty, whatIf` },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("/api/query error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
