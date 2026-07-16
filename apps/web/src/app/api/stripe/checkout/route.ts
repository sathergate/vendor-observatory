import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { getStripe, getPriceId } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/auth";

/** Validate that a vendor canonical_id exists in the vendors table. */
async function isValidVendor(vendorId: string): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return false;
  const pool = new Pool({ connectionString });
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM vendors WHERE canonical_id = $1",
      [vendorId],
    );
    return rows.length > 0;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { plan, email: bodyEmail, vendorId } = (await request.json()) as {
      plan?: string;
      email?: string;
      vendorId?: string;
    };

    if (!plan || !["starter", "growth"].includes(plan)) {
      return NextResponse.json(
        { error: "Invalid plan. Choose starter or growth." },
        { status: 400 },
      );
    }

    if (!vendorId) {
      return NextResponse.json(
        { error: "Vendor selection is required. Please choose the vendor you want to monitor." },
        { status: 400 },
      );
    }

    const validVendor = await isValidVendor(vendorId);
    if (!validVendor) {
      return NextResponse.json(
        { error: "Invalid vendor selection. Please choose a valid vendor." },
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
      metadata: { plan, vendorId },
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
