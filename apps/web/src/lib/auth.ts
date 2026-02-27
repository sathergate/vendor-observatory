import { Pool } from "pg";
import { cookies } from "next/headers";
import crypto from "crypto";

// ── Lazy Pool (reuse from db.ts pattern) ──────────────────────────

let _pool: Pool | null = null;
let _poolFailed = false;

function getPool(): Pool | null {
  if (_poolFailed) return null;
  if (_pool) return _pool;
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      _poolFailed = true;
      return null;
    }
    _pool = new Pool({ connectionString });
    return _pool;
  } catch {
    _poolFailed = true;
    return null;
  }
}

// ── Auto-create tables ────────────────────────────────────────────

let _tablesReady = false;

async function ensureTables() {
  if (_tablesReady) return;
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT UNIQUE,
        plan TEXT NOT NULL DEFAULT 'starter',
        status TEXT NOT NULL DEFAULT 'active',
        current_period_end TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    _tablesReady = true;
  } catch (err) {
    console.error("[auth] Failed to create tables:", err);
  }
}

// ── User operations ───────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
}

export async function createUser(email: string, password: string): Promise<AuthUser | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;
  const id = crypto.randomUUID();
  try {
    await pool.query(
      "INSERT INTO auth_users (id, email, password) VALUES ($1, $2, $3)",
      [id, email, password],
    );
    return { id, email };
  } catch {
    return null; // e.g. duplicate email
  }
}

export async function verifyUser(email: string, password: string): Promise<AuthUser | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      "SELECT id, email FROM auth_users WHERE email = $1 AND password = $2",
      [email, password],
    );
    return (rows[0] as AuthUser) ?? null;
  } catch {
    return null;
  }
}

// ── Session operations ────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  await ensureTables();
  const pool = getPool();
  const token = crypto.randomUUID();
  if (!pool) return token;
  try {
    await pool.query(
      "INSERT INTO auth_sessions (token, user_id) VALUES ($1, $2)",
      [token, userId],
    );
  } catch { /* best effort */ }
  return token;
}

export async function getUserFromToken(token: string): Promise<AuthUser | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      "SELECT u.id, u.email FROM auth_users u JOIN auth_sessions s ON u.id = s.user_id WHERE s.token = $1",
      [token],
    );
    return (rows[0] as AuthUser) ?? null;
  } catch {
    return null;
  }
}

export async function deleteSession(token: string): Promise<void> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query("DELETE FROM auth_sessions WHERE token = $1", [token]);
  } catch { /* best effort */ }
}

// ── Subscription operations ───────────────────────────────────────

/** Email that always bypasses payment checks. */
const BYPASS_EMAIL = "test@test.com";

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string;
  status: string;
  current_period_end: Date | null;
}

/** Create or update a subscription for a user (keyed by user_id). */
export async function upsertSubscription(
  userId: string,
  data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    plan?: string;
    status?: string;
    currentPeriodEnd?: Date;
  },
): Promise<void> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return;
  try {
    const existing = await pool.query(
      "SELECT id FROM subscriptions WHERE user_id = $1",
      [userId],
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE subscriptions
         SET stripe_customer_id = COALESCE($2, stripe_customer_id),
             stripe_subscription_id = COALESCE($3, stripe_subscription_id),
             plan = COALESCE($4, plan),
             status = COALESCE($5, status),
             current_period_end = COALESCE($6, current_period_end),
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          userId,
          data.stripeCustomerId ?? null,
          data.stripeSubscriptionId ?? null,
          data.plan ?? null,
          data.status ?? null,
          data.currentPeriodEnd ?? null,
        ],
      );
    } else {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          userId,
          data.stripeCustomerId ?? null,
          data.stripeSubscriptionId ?? null,
          data.plan ?? "starter",
          data.status ?? "active",
          data.currentPeriodEnd ?? null,
        ],
      );
    }
  } catch (err) {
    console.error("[auth] upsertSubscription failed:", err);
  }
}

/** Look up a user by email. */
export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      "SELECT id, email FROM auth_users WHERE email = $1",
      [email],
    );
    return (rows[0] as AuthUser) ?? null;
  } catch {
    return null;
  }
}

/** Get subscription for a user by their user ID. */
export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      "SELECT id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end FROM subscriptions WHERE user_id = $1",
      [userId],
    );
    return (rows[0] as Subscription) ?? null;
  } catch {
    return null;
  }
}

/** Update a subscription by its Stripe subscription ID. */
export async function updateSubscriptionByStripeId(
  stripeSubscriptionId: string,
  data: { status?: string; plan?: string; currentPeriodEnd?: Date },
): Promise<void> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE subscriptions
       SET status = COALESCE($2, status),
           plan = COALESCE($3, plan),
           current_period_end = COALESCE($4, current_period_end),
           updated_at = NOW()
       WHERE stripe_subscription_id = $1`,
      [
        stripeSubscriptionId,
        data.status ?? null,
        data.plan ?? null,
        data.currentPeriodEnd ?? null,
      ],
    );
  } catch (err) {
    console.error("[auth] updateSubscriptionByStripeId failed:", err);
  }
}

/** Deactivate (cancel) a subscription by its Stripe subscription ID. */
export async function deactivateSubscriptionByStripeId(
  stripeSubscriptionId: string,
): Promise<void> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE subscriptions SET status = 'canceled', updated_at = NOW() WHERE stripe_subscription_id = $1`,
      [stripeSubscriptionId],
    );
  } catch (err) {
    console.error("[auth] deactivateSubscriptionByStripeId failed:", err);
  }
}

/**
 * Check whether a user has an active payment linked.
 * Returns true for the bypass email (test@test.com) unconditionally.
 */
export async function hasActivePayment(userId: string, email: string): Promise<boolean> {
  if (email === BYPASS_EMAIL) return true;
  const sub = await getUserSubscription(userId);
  if (!sub) return false;
  return sub.status === "active" || sub.status === "trialing";
}

// ── Cookie helper for server components / route handlers ──────────

const COOKIE_NAME = "session_token";

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return getUserFromToken(token);
  } catch {
    return null;
  }
}

export function sessionCookieOptions(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: "lax" as const,
  };
}

export function deleteSessionCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  };
}

// ── Payment gate for API routes ──────────────────────────────────

/**
 * Verify the current user is authenticated AND has an active payment.
 * Returns the user if all checks pass, or a NextResponse error to return early.
 */
export async function requireActivePayment(): Promise<
  { user: AuthUser; error?: never } | { user?: never; error: Response }
> {
  // Dynamic import to avoid pulling NextResponse into non-API contexts
  const { NextResponse } = await import("next/server");

  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const paid = await hasActivePayment(user.id, user.email);
  if (!paid) {
    return {
      error: NextResponse.json(
        { error: "Payment required. Please subscribe to access this resource." },
        { status: 403 },
      ),
    };
  }

  return { user };
}
