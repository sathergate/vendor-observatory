import { NextResponse } from "next/server";
import { saveJobEmail } from "@/lib/onboard";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const { email } = await request.json();
  await saveJobEmail(jobId, email);

  // TODO: When the comprehensive stage completes, send the full report to this email.
  // For now, just log as a placeholder.
  console.log(`[onboard] TODO: send comprehensive report email to ${email} for job ${jobId}`);

  return NextResponse.json({ success: true });
}
