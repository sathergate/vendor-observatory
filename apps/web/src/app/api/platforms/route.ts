import { NextResponse } from "next/server";
import { getPlatformComparison } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPlatformComparison());
  } catch (err) {
    console.error("/api/platforms error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
