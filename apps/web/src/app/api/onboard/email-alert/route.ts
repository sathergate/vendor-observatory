import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { email } = await request.json();

  // TODO: Store subscription and send email alerts when scorecard scores change significantly.
  console.log(`[onboard] TODO: subscribe ${email} to scorecard change alerts`);

  return NextResponse.json({ success: true });
}
