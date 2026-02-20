import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession, deleteSessionCookie } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;

  if (token) {
    await deleteSession(token);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(deleteSessionCookie());
  return res;
}
