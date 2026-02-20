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
