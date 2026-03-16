import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import PostgresAdapter from "@auth/pg-adapter";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

// ── Shared PG pool for the adapter ──────────────────────────────────

let _pool: Pool | null = null;

export function getAuthPool(): Pool | null {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  _pool = new Pool({ connectionString });
  return _pool;
}

// ── Auth.js configuration ───────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: (() => {
    const pool = getAuthPool();
    if (!pool) return undefined as never;
    return PostgresAdapter(pool);
  })(),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    newUser: "/get-started/analyze",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const pool = getAuthPool();
        if (!pool) return null;

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        // Look up user in auth_users (legacy) or users (Auth.js) table
        try {
          // Try Auth.js users table first
          const { rows } = await pool.query(
            'SELECT id, email, "passwordHash" FROM users WHERE email = $1',
            [email],
          );
          if (rows.length > 0) {
            const user = rows[0];
            if (!user.passwordHash) return null;
            const valid = await bcrypt.compare(password, user.passwordHash);
            if (!valid) return null;
            return { id: user.id, email: user.email };
          }

          // Fallback: check legacy auth_users table
          const legacy = await pool.query(
            "SELECT id, email, password FROM auth_users WHERE email = $1",
            [email],
          );
          if (legacy.rows.length > 0) {
            const user = legacy.rows[0];
            // Legacy passwords may be plaintext — try bcrypt first, then plaintext
            let valid = false;
            try {
              valid = await bcrypt.compare(password, user.password);
            } catch {
              valid = password === user.password;
            }
            if (!valid) return null;
            return { id: user.id, email: user.email };
          }

          return null;
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
});
