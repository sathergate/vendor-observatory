import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import {
  getUserByEmail,
  upsertSubscription,
  updateSubscriptionByStripeId,
  deactivateSubscriptionByStripeId,
} from "@/lib/auth";
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
      const email = session.customer_email;
      const plan = session.metadata?.plan ?? "starter";
      console.log(
        `[stripe/webhook] Checkout completed — customer: ${email}, plan: ${plan}`,
      );

      if (email) {
        const user = await getUserByEmail(email);
        if (user) {
          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id ?? null;
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id ?? null;

          await upsertSubscription(user.id, {
            stripeCustomerId: customerId ?? undefined,
            stripeSubscriptionId: subscriptionId ?? undefined,
            plan,
            status: "active",
          });
          console.log(`[stripe/webhook] Subscription activated for ${email}`);
        } else {
          console.warn(`[stripe/webhook] No user found for email: ${email}`);
        }
      }
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log(
        `[stripe/webhook] Subscription updated — id: ${subscription.id}, status: ${subscription.status}`,
      );
      const periodEnd = subscription.items?.data?.[0]?.current_period_end;
      await updateSubscriptionByStripeId(subscription.id, {
        status: subscription.status,
        ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
      });
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log(
        `[stripe/webhook] Subscription canceled — id: ${subscription.id}`,
      );
      await deactivateSubscriptionByStripeId(subscription.id);
      break;
    }
    default:
      console.log(`[stripe/webhook] Unhandled event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
