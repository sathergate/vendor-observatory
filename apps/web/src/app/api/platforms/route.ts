import { NextResponse } from "next/server";
import { getPlatformComparison } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPlatformComparison());
}
