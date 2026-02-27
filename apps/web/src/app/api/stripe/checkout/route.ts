import { NextRequest, NextResponse } from "next/server";
import { getStripe, getPriceId } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { plan, email: bodyEmail } = (await request.json()) as {
      plan?: string;
      email?: string;
    };

    if (!plan || !["starter", "growth"].includes(plan)) {
      return NextResponse.json(
        { error: "Invalid plan. Choose starter or growth." },
        { status: 400 },
      );
    }

    const priceId = getPriceId(plan);
    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price not configured for "${plan}" plan. Set STRIPE_PRICE_${plan.toUpperCase()} env var.` },
        { status: 500 },
      );
    }

    // Resolve customer email: prefer logged-in user, fall back to body param
    const user = await getCurrentUser();
    const customerEmail = user?.email ?? bodyEmail ?? null;

    const origin = request.nextUrl.origin;
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/payment?plan=${plan}&canceled=1`,
      metadata: { plan },
      ...(customerEmail ? { customer_email: customerEmail } : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout] Error creating session:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
