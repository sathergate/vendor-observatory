import { NextResponse } from "next/server";
import { emailExists, createPasswordResetToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { email } = (await req.json()) as { email?: string };

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const exists = await emailExists(normalizedEmail);
  if (!exists) {
    return NextResponse.json(
      { error: "No account found with that email address" },
      { status: 404 },
    );
  }

  const token = await createPasswordResetToken(normalizedEmail);
  if (!token) {
    return NextResponse.json(
      { error: "Failed to create reset token" },
      { status: 500 },
    );
  }

  // TODO: Integrate a transactional email service (e.g. SendGrid, Resend, Nodemailer)
  // to send the reset link to the user. For now, log it server-side.
  const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/reset-password?token=${token}`;
  console.log(`[auth] Password reset link for ${normalizedEmail}: ${resetUrl}`);

  return NextResponse.json({
    message: "Password reset link has been sent to your email",
  });
}
