import { NextResponse } from "next/server";
import { saveJobEmail } from "@/lib/onboard";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const { email } = await request.json();
  await saveJobEmail(jobId, email);
  return NextResponse.json({ success: true });
}
