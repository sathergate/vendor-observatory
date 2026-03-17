import { NextResponse } from "next/server";
import { getCurrentUser, hasActivePayment, getUserSubscription, isAdminEmail } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const paymentActive = await hasActivePayment(user.id, user.email);
  const subscription = await getUserSubscription(user.id);
  const admin = isAdminEmail(user.email);

  // Admin users get full access with no vendor restriction
  if (admin) {
    return NextResponse.json({
      user,
      paymentActive: true,
      isAdmin: true,
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            vendorCanonicalId: subscription.vendor_canonical_id,
          }
        : { plan: "admin", status: "active", vendorCanonicalId: null },
    });
  }

  const vendorCanonicalId = subscription?.vendor_canonical_id ?? null;

  return NextResponse.json({
    user,
    paymentActive,
    subscription: subscription
      ? {
          plan: subscription.plan,
          status: subscription.status,
          vendorCanonicalId,
        }
      : null,
  });
}
