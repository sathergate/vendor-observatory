import { NextResponse } from "next/server";
import { getCurrentUser, hasActivePayment, getUserSubscription } from "@/lib/auth";

/** Email that always bypasses payment checks. */
const BYPASS_EMAIL = "test@test.com";
const BYPASS_VENDOR = "neon";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const paymentActive = await hasActivePayment(user.id, user.email);
  const subscription = await getUserSubscription(user.id);

  // For the bypass user, always return a vendor even if no subscription row exists
  const vendorCanonicalId =
    user.email === BYPASS_EMAIL
      ? (subscription?.vendor_canonical_id ?? BYPASS_VENDOR)
      : (subscription?.vendor_canonical_id ?? null);

  return NextResponse.json({
    user,
    paymentActive,
    subscription: subscription
      ? {
          plan: subscription.plan,
          status: subscription.status,
          vendorCanonicalId,
        }
      : user.email === BYPASS_EMAIL
        ? { plan: "starter", status: "active", vendorCanonicalId: BYPASS_VENDOR }
        : null,
  });
}
