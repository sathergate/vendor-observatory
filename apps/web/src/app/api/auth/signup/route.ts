import { NextResponse } from "next/server";
import { createUser } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const user = await createUser(email, password);
  if (!user) {
    return NextResponse.json({ error: "Could not create account (email may already be taken)" }, { status: 409 });
  }

  // User created — the frontend will call NextAuth signIn("credentials") to establish the JWT session
  return NextResponse.json({ user });
}
