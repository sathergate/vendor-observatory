import { NextResponse } from "next/server";
import { createUser, createSession, sessionCookieOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await createUser(email, password);
  if (!user) {
    return NextResponse.json({ error: "Could not create account (email may already be taken)" }, { status: 409 });
  }

  const token = await createSession(user.id);
  const res = NextResponse.json({ user });
  res.cookies.set(sessionCookieOptions(token));
  return res;
}
