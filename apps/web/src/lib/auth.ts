import { Pool } from "pg";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";

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
    // Auth.js creates its own users/accounts/sessions tables via the adapter.
    // Keep legacy auth_users for backward compatibility during migration.
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
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT UNIQUE,
        plan TEXT NOT NULL DEFAULT 'starter',
        status TEXT NOT NULL DEFAULT 'active',
        current_period_end TIMESTAMPTZ,
        vendor_canonical_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      ALTER TABLE subscriptions
        ADD COLUMN IF NOT EXISTS vendor_canonical_id TEXT
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_vendor
        ON subscriptions(vendor_canonical_id)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    _tablesReady = true;
  } catch (err) {
    console.error("[auth] Failed to create tables:", err);
  }
}

// ── User types ───────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
}

// ── User operations (for signup API — uses bcrypt) ───────────────

export async function createUser(email: string, password: string): Promise<AuthUser | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;
  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    // Insert into Auth.js users table (used by the adapter)
    await pool.query(
      `INSERT INTO users (id, email, "emailVerified", "passwordHash")
       VALUES ($1, $2, NULL, $3)
       ON CONFLICT (email) DO NOTHING`,
      [id, email.toLowerCase().trim(), passwordHash],
    );
    // Check if insert succeeded (might conflict on duplicate email)
    const { rows } = await pool.query(
      "SELECT id, email FROM users WHERE email = $1",
      [email.toLowerCase().trim()],
    );
    if (rows.length === 0) return null;
    return { id: rows[0].id, email: rows[0].email };
  } catch {
    return null;
  }
}

export async function verifyUser(email: string, password: string): Promise<AuthUser | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  const normalizedEmail = email.toLowerCase().trim();

  // Try Auth.js users table first
  try {
    const { rows } = await pool.query(
      'SELECT id, email, "passwordHash" FROM users WHERE email = $1',
      [normalizedEmail],
    );
    if (rows.length > 0 && rows[0].passwordHash) {
      const valid = await bcrypt.compare(password, rows[0].passwordHash);
      if (valid) return { id: rows[0].id, email: rows[0].email };
      return null;
    }
  } catch {
    // users table may not exist yet
  }

  // Fallback: check legacy auth_users table
  try {
    const { rows } = await pool.query(
      "SELECT id, email, password FROM auth_users WHERE email = $1",
      [normalizedEmail],
    );
    if (rows.length > 0) {
      let valid = false;
      try {
        valid = await bcrypt.compare(password, rows[0].password);
      } catch {
        valid = password === rows[0].password;
      }
      if (valid) return { id: rows[0].id, email: rows[0].email };
    }
  } catch {
    // legacy table may not exist
  }

  return null;
}

// ── Password reset operations ────────────────────────────────────

/** Create a password reset token for a user. Returns the token string. */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;

  const normalizedEmail = email.toLowerCase().trim();
  const user = await getUserByEmail(normalizedEmail);
  if (!user) return null;

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  try {
    // Invalidate any existing tokens for this user
    await pool.query(
      "UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE",
      [user.id],
    );
    await pool.query(
      "INSERT INTO password_reset_tokens (token, user_id, email, expires_at) VALUES ($1, $2, $3, $4)",
      [token, user.id, normalizedEmail, expiresAt],
    );
    return token;
  } catch {
    return null;
  }
}

/** Verify a password reset token. Returns the user if valid, null otherwise. */
export async function verifyPasswordResetToken(token: string): Promise<AuthUser | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;

  try {
    const { rows } = await pool.query(
      "SELECT user_id, email FROM password_reset_tokens WHERE token = $1 AND used = FALSE AND expires_at > NOW()",
      [token],
    );
    if (rows.length === 0) return null;
    return { id: rows[0].user_id, email: rows[0].email };
  } catch {
    return null;
  }
}

/** Reset a user's password using a valid token. */
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return false;

  const user = await verifyPasswordResetToken(token);
  if (!user) return false;

  const passwordHash = await bcrypt.hash(newPassword, 10);

  try {
    // Update password in Auth.js users table
    await pool.query(
      'UPDATE users SET "passwordHash" = $1 WHERE id = $2',
      [passwordHash, user.id],
    );
    // Also update legacy table if it exists
    try {
      await pool.query(
        "UPDATE auth_users SET password = $1 WHERE id = $2",
        [passwordHash, user.id],
      );
    } catch { /* legacy table may not exist */ }
    // Mark token as used
    await pool.query(
      "UPDATE password_reset_tokens SET used = TRUE WHERE token = $1",
      [token],
    );
    return true;
  } catch {
    return false;
  }
}

/** Check if an email exists in the system. */
export async function emailExists(email: string): Promise<boolean> {
  const user = await getUserByEmail(email);
  return user !== null;
}

// ── Legacy session operations (kept for backward compat) ─────────

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
  vendor_canonical_id: string | null;
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
    vendorCanonicalId?: string;
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
             vendor_canonical_id = COALESCE($7, vendor_canonical_id),
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          userId,
          data.stripeCustomerId ?? null,
          data.stripeSubscriptionId ?? null,
          data.plan ?? null,
          data.status ?? null,
          data.currentPeriodEnd ?? null,
          data.vendorCanonicalId ?? null,
        ],
      );
    } else {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, vendor_canonical_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          userId,
          data.stripeCustomerId ?? null,
          data.stripeSubscriptionId ?? null,
          data.plan ?? "starter",
          data.status ?? "active",
          data.currentPeriodEnd ?? null,
          data.vendorCanonicalId ?? null,
        ],
      );
    }
  } catch (err) {
    console.error("[auth] upsertSubscription failed:", err);
  }
}

/** Look up a user by email (checks both Auth.js users table and legacy). */
export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;
  const normalizedEmail = email.toLowerCase().trim();
  try {
    // Auth.js users table
    const { rows } = await pool.query(
      "SELECT id, email FROM users WHERE email = $1",
      [normalizedEmail],
    );
    if (rows.length > 0) return rows[0] as AuthUser;
  } catch { /* table may not exist */ }
  try {
    // Legacy table
    const { rows } = await pool.query(
      "SELECT id, email FROM auth_users WHERE email = $1",
      [normalizedEmail],
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
      "SELECT id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, vendor_canonical_id FROM subscriptions WHERE user_id = $1",
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

/** Default vendor for the test bypass account. */
const BYPASS_VENDOR = "neon";

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

/** Get subscription details for the current user (active/trialing only). */
export async function getSubscriptionForUser(userId: string): Promise<{
  plan: string;
  status: string;
  vendor_canonical_id: string | null;
} | null> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query<{
      plan: string;
      status: string;
      vendor_canonical_id: string | null;
    }>(
      `SELECT plan, status, vendor_canonical_id
       FROM subscriptions
       WHERE user_id = $1
         AND status IN ('active', 'trialing')
       LIMIT 1`,
      [userId],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Set vendor_canonical_id on a subscription (only if currently NULL). */
export async function setSubscriptionVendor(userId: string, vendorCanonicalId: string): Promise<"ok" | "already_set" | "no_subscription"> {
  await ensureTables();
  const pool = getPool();
  if (!pool) return "no_subscription";
  try {
    const { rows } = await pool.query(
      `SELECT id, vendor_canonical_id FROM subscriptions
       WHERE user_id = $1 AND status IN ('active', 'trialing')
       LIMIT 1`,
      [userId],
    );
    if (rows.length === 0) return "no_subscription";
    const sub = rows[0] as { id: string; vendor_canonical_id: string | null };
    if (sub.vendor_canonical_id) return "already_set";
    await pool.query(
      `UPDATE subscriptions SET vendor_canonical_id = $2, updated_at = NOW() WHERE id = $1`,
      [sub.id, vendorCanonicalId],
    );
    return "ok";
  } catch {
    return "no_subscription";
  }
}

// ── Cookie helpers (legacy — kept for backward compat) ────────────

const COOKIE_NAME = "session_token";

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

// ── getCurrentUser — now uses Auth.js session ─────────────────────

/**
 * Get the current authenticated user.
 * Tries Auth.js JWT session first, falls back to legacy cookie-based session.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  // Try Auth.js session
  try {
    const session = await auth();
    if (session?.user?.id && session?.user?.email) {
      return { id: session.user.id, email: session.user.email };
    }
  } catch {
    // Auth.js not configured or session unavailable
  }

  // Fallback: legacy cookie-based session
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    await ensureTables();
    const pool = getPool();
    if (!pool) return null;
    const { rows } = await pool.query(
      "SELECT u.id, u.email FROM auth_users u JOIN auth_sessions s ON u.id = s.user_id WHERE s.token = $1",
      [token],
    );
    return (rows[0] as AuthUser) ?? null;
  } catch {
    return null;
  }
}

// ── Payment gate for API routes ──────────────────────────────────

/**
 * Verify the current user is authenticated AND has an active payment.
 * Returns the user and their linked vendor if all checks pass, or a NextResponse error to return early.
 */
export async function requireActivePayment(): Promise<
  { user: AuthUser; vendorCanonicalId: string | null; error?: never } | { user?: never; vendorCanonicalId?: never; error: Response }
> {
  const { NextResponse } = await import("next/server");

  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // Bypass user gets a hardcoded vendor
  if (user.email === BYPASS_EMAIL) {
    return { user, vendorCanonicalId: BYPASS_VENDOR };
  }

  const sub = await getSubscriptionForUser(user.id);
  if (!sub) {
    return {
      error: NextResponse.json(
        { error: "Payment required. Please subscribe to access this resource." },
        { status: 403 },
      ),
    };
  }

  return { user, vendorCanonicalId: sub.vendor_canonical_id };
}
