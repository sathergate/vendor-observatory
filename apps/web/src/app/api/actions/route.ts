import { NextResponse } from "next/server";
import { getActionFunnel } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getActionFunnel());
  } catch (err) {
    console.error("/api/actions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
