import { NextResponse } from "next/server";
import { Resend } from "resend";
import { emailExists, createPasswordResetToken } from "@/lib/auth";

export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email } = body;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  let exists: boolean;
  try {
    exists = await emailExists(normalizedEmail);
  } catch (err) {
    console.error("[auth] Failed to check email existence:", err);
    return NextResponse.json(
      { error: "Unable to process your request. Please try again later." },
      { status: 500 },
    );
  }

  // Always return success to prevent email enumeration — but only send email if account exists
  if (!exists) {
    return NextResponse.json({
      message: "If an account exists with that email, a password reset link has been sent",
    });
  }

  const token = await createPasswordResetToken(normalizedEmail);
  if (!token) {
    // Don't reveal the failure reason to the client
    return NextResponse.json({
      message: "If an account exists with that email, a password reset link has been sent",
    });
  }

  const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/reset-password?token=${token}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[auth] RESEND_API_KEY is not configured");
    return NextResponse.json(
      { error: "Email service is not configured. Please contact support." },
      { status: 500 },
    );
  }

  try {
    const resend = new Resend(apiKey);
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
        { error: "Failed to send reset email. Please try again later." },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error(`[auth] Resend threw while sending reset email to ${normalizedEmail}:`, err);
    return NextResponse.json(
      { error: "Failed to send reset email. Please try again later." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message: "If an account exists with that email, a password reset link has been sent",
  });
}
