import { NextResponse } from "next/server";
import { getCurrentUser, hasActivePayment, getUserSubscription, BYPASS_EMAIL, BYPASS_VENDOR } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const paymentActive = await hasActivePayment(user.id, user.email);
  const subscription = await getUserSubscription(user.id);

  return NextResponse.json({
    user,
    paymentActive,
    subscription: subscription
      ? { plan: subscription.plan, status: subscription.status }
      : null,
    vendor: user.email === BYPASS_EMAIL ? BYPASS_VENDOR : undefined,
  });
}
