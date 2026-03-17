import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession, deleteSessionCookie } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();

  // Clear legacy session
  const token = cookieStore.get("session_token")?.value;
  if (token) {
    await deleteSession(token);
  }

  const res = NextResponse.json({ ok: true });

  // Clear legacy session cookie
  res.cookies.set(deleteSessionCookie());

  // Clear NextAuth JWT session cookies
  res.cookies.set("authjs.session-token", "", { path: "/", maxAge: 0 });
  res.cookies.set("__Secure-authjs.session-token", "", { path: "/", maxAge: 0, secure: true });
  res.cookies.set("authjs.callback-url", "", { path: "/", maxAge: 0 });
  res.cookies.set("authjs.csrf-token", "", { path: "/", maxAge: 0 });

  return res;
}
