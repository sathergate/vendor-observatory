import { NextResponse } from "next/server";
import { Resend } from "resend";
import { emailExists, createPasswordResetToken } from "@/lib/auth";

// Always return the same success message regardless of whether the email exists.
// This prevents account-enumeration attacks.
const SUCCESS_RESPONSE = {
  message:
    "If an account with that email exists, a password reset link has been sent.",
};

export async function POST(req: Request) {
  const { email } = (await req.json()) as { email?: string };

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // ── Pre-flight: ensure Resend API key is configured ──────────
  if (!process.env.RESEND_API_KEY) {
    console.error(
      "[auth] RESEND_API_KEY is not set — cannot send reset email",
    );
    // Return success to the user to avoid leaking config state, but log loudly
    return NextResponse.json(SUCCESS_RESPONSE);
  }

  // ── Check if account exists (never leak this to the client) ──
  const exists = await emailExists(normalizedEmail);
  if (!exists) {
    // Return the same 200 response so callers cannot enumerate accounts
    return NextResponse.json(SUCCESS_RESPONSE);
  }

  const token = await createPasswordResetToken(normalizedEmail);
  if (!token) {
    console.error(
      `[auth] Failed to create reset token for ${normalizedEmail}`,
    );
    return NextResponse.json(SUCCESS_RESPONSE);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const fromAddress =
    process.env.RESEND_FROM_EMAIL || "noreply@lm-panopticon.com";

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: normalizedEmail,
      subject: "Reset your Vendor Observatory password",
      html: `
        <p>You requested a password reset for your Vendor Observatory account.</p>
        <p><a href="${resetUrl}">Click here to reset your password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      `,
    });

    if (error) {
      console.error(
        `[auth] Resend API error for ${normalizedEmail}:`,
        JSON.stringify(error),
      );
      return NextResponse.json(
        { error: "Failed to send reset email. Please try again later." },
        { status: 500 },
      );
    }

    console.info(
      `[auth] Reset email sent to ${normalizedEmail} (id: ${data?.id})`,
    );
  } catch (err) {
    console.error(
      `[auth] Unexpected error sending reset email to ${normalizedEmail}:`,
      err,
    );
    return NextResponse.json(
      { error: "Failed to send reset email. Please try again later." },
      { status: 500 },
    );
  }

  return NextResponse.json(SUCCESS_RESPONSE);
}
