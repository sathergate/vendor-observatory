import { NextResponse } from "next/server";
import { getCurrentUser, createApiKey, listApiKeys, revokeApiKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** List API keys for the current user (masked). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await listApiKeys(user.id);
  return NextResponse.json({ keys });
}

/** Create a new API key. Body: { name?: string } */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let name = "default";
  try {
    const body = await request.json();
    if (body.name && typeof body.name === "string") {
      name = body.name.slice(0, 100);
    }
  } catch {
    // Body is optional
  }

  const result = await createApiKey(user.id, name);
  if (!result) {
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }

  return NextResponse.json({
    key: result.key,
    record: result.record,
    message: "Store this key securely. It will not be shown again.",
  }, { status: 201 });
}

/** Revoke an API key. Body: { id: string } */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let keyId: string | undefined;
  try {
    const body = await request.json();
    keyId = body.id;
  } catch {
    return NextResponse.json({ error: "Request body must include { id: string }" }, { status: 400 });
  }

  if (!keyId) {
    return NextResponse.json({ error: "Missing key id" }, { status: 400 });
  }

  const revoked = await revokeApiKey(user.id, keyId);
  if (!revoked) {
    return NextResponse.json({ error: "Key not found or already revoked" }, { status: 404 });
  }

  return NextResponse.json({ revoked: true });
}
