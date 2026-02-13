import { NextResponse } from "next/server";
import { getActionFunnel } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getActionFunnel());
}
