import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }

  _stripe = new Stripe(key, { apiVersion: "2026-02-25.clover" });
  return _stripe;
}

/** Map internal plan IDs to Stripe Price IDs set via env vars. */
export function getPriceId(plan: string): string | null {
  const map: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth: process.env.STRIPE_PRICE_GROWTH,
  };
  return map[plan] ?? null;
}

export const PLAN_LABELS: Record<string, string> = {
  starter: "Starter — $99 / month",
  growth: "Growth — $399 / month",
};
