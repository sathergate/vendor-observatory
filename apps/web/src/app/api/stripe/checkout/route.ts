import { NextRequest, NextResponse } from "next/server";
import { getStripe, getPriceId } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    const { plan } = (await request.json()) as { plan?: string };

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

    const origin = request.nextUrl.origin;
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/payment?plan=${plan}&canceled=1`,
      metadata: { plan },
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
