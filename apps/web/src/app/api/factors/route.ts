import { NextResponse } from "next/server";
import { requireActivePayment } from "@/lib/auth";
import { loadVendorFactors, getVendorFactors, getCategoryFactors } from "@/lib/load-vendor-factors";
import { generateImprovements } from "@/lib/factor-improvements";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const vendorId = url.searchParams.get("vendor") ?? undefined;
    const categoryId = url.searchParams.get("category") ?? undefined;

    // Single vendor lookup
    if (vendorId) {
      const vendor = getVendorFactors(vendorId);
      if (!vendor) {
        return NextResponse.json({ error: `Vendor '${vendorId}' not found in factors dataset` }, { status: 404 });
      }

      const dataset = loadVendorFactors();
      // Find this vendor's category to compute category context
      const categoryEntry = Object.entries(dataset.byCategory).find(([, cat]) =>
        cat.vendors.some((v) => v.vendorId === vendorId),
      );
      const categoryAvg = categoryEntry ? categoryEntry[1].avgScores : dataset.globalAvg;
      const categoryBest = categoryEntry ? categoryEntry[1].bestScores : {};

      const categorySummary = categoryEntry ? categoryEntry[1] : null;
      const improvements = generateImprovements(vendor, dataset.factors, categorySummary);

      return NextResponse.json({
        vendor,
        factors: dataset.factors,
        categoryId: categoryEntry?.[0] ?? null,
        categoryAvg,
        categoryBest,
        globalAvg: dataset.globalAvg,
        improvements,
      });
    }

    // Category lookup
    if (categoryId) {
      const category = getCategoryFactors(categoryId);
      if (!category) {
        return NextResponse.json({ error: `Category '${categoryId}' not found` }, { status: 404 });
      }
      const dataset = loadVendorFactors();
      return NextResponse.json({
        category,
        factors: dataset.factors,
        globalAvg: dataset.globalAvg,
      });
    }

    // Full dataset
    const dataset = loadVendorFactors();
    return NextResponse.json({
      factors: dataset.factors,
      vendors: dataset.vendors,
      byCategory: dataset.byCategory,
      globalAvg: dataset.globalAvg,
    });
  } catch (err) {
    console.error("/api/factors error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
