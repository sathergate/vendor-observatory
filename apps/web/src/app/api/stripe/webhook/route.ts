import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(
        `[stripe/webhook] Checkout completed — customer: ${session.customer_email}, plan: ${session.metadata?.plan}`,
      );
      // TODO: Activate the user's subscription in your database.
      // e.g. await activateSubscription(session.customer_email, session.metadata?.plan);
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log(
        `[stripe/webhook] Subscription updated — status: ${subscription.status}`,
      );
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log(
        `[stripe/webhook] Subscription canceled — id: ${subscription.id}`,
      );
      // TODO: Deactivate the user's subscription in your database.
      break;
    }
    default:
      console.log(`[stripe/webhook] Unhandled event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
