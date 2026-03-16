import { NextResponse } from "next/server";
import { resetPassword } from "@/lib/auth";

export async function POST(req: Request) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, password } = body;

  if (!token || !password) {
    return NextResponse.json(
      { error: "Token and password are required" },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  let success: boolean;
  try {
    success = await resetPassword(token, password);
  } catch (err) {
    console.error("[auth] resetPassword threw:", err);
    return NextResponse.json(
      { error: "Unable to reset password. Please try again later." },
      { status: 500 },
    );
  }

  if (!success) {
    return NextResponse.json(
      { error: "Invalid or expired reset token" },
      { status: 400 },
    );
  }

  return NextResponse.json({ message: "Password has been reset successfully" });
}
