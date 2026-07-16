import { NextResponse } from "next/server";
import { getActionFunnel } from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;

  try {
    return NextResponse.json(await getActionFunnel(auth.vendorCanonicalId));
  } catch (err) {
    console.error("/api/actions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
