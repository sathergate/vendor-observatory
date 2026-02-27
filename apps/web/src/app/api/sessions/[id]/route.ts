import { NextResponse } from "next/server";
import { getSessionDetail } from "@/lib/db";
import { requireActivePayment } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActivePayment();
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const detail = await getSessionDetail(id);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    console.error("/api/sessions/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
