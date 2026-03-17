import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/auth";

/**
 * POST /api/auth/login — verifies credentials.
 * The frontend now uses NextAuth signIn("credentials") for actual session creation.
 * This route is kept for backward compatibility / API consumers.
 */
export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  let user;
  try {
    user = await verifyUser(email, password);
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  return NextResponse.json({ user });
}
