import { NextResponse } from "next/server";
import { Resend } from "resend";
import { emailExists, createPasswordResetToken } from "@/lib/auth";

const resend = new Resend(process.env.RESEND_API_KEY);

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

  const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/reset-password?token=${token}`;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "noreply@lm-panopticon.com",
    to: normalizedEmail,
    subject: "Reset your Vendor Observatory password",
    html: `
      <p>You requested a password reset for your Vendor Observatory account.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  });

  if (error) {
    console.error(`[auth] Failed to send reset email to ${normalizedEmail}:`, error);
    return NextResponse.json(
      { error: "Failed to send reset email" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message: "Password reset link has been sent to your email",
  });
}
