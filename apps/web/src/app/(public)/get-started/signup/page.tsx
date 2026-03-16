"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/** Freemail domains where we cannot infer a product URL. */
const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "live.com", "aol.com", "icloud.com", "me.com", "mac.com", "protonmail.com",
  "proton.me", "mail.com", "zoho.com", "yandex.com", "gmx.com", "gmx.net",
  "fastmail.com", "tutanota.com", "hey.com",
]);

function domainFromEmail(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const domain = parts[1].toLowerCase().trim();
  if (FREEMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

export default function GetStartedSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Could not create account");
        return;
      }

      window.dispatchEvent(new Event("auth-change"));

      // Extract domain from work email and pre-fill the analyze page
      const domain = domainFromEmail(email);
      const params = new URLSearchParams();
      if (domain) params.set("domain", domain);
      router.push(`/get-started/analyze${params.toString() ? `?${params}` : ""}`);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inferredDomain = domainFromEmail(email);

  return (
    <div className="max-w-sm mx-auto px-6 py-24">
      <h1 className="text-2xl font-bold mb-2 text-center text-primary">
        Create your account
      </h1>
      <p className="text-[14px] text-secondary text-center mb-8">
        Use your work email so we can match it to your product.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-[12px] text-secondary mb-1">
            Work email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourproduct.com"
            required
            disabled={loading}
            className="w-full px-3 py-2 bg-surface border border-border rounded-[6px] text-primary text-[14px]
                       placeholder-muted focus:outline-none focus:border-accent disabled:opacity-50"
          />
          {email && inferredDomain && (
            <p className="text-[12px] text-signal-strong mt-1">
              We&apos;ll analyze {inferredDomain}
            </p>
          )}
          {email && email.includes("@") && !inferredDomain && (
            <p className="text-[12px] text-muted mt-1">
              You&apos;ll enter your product URL in the next step
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-[12px] text-secondary mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            disabled={loading}
            className="w-full px-3 py-2 bg-surface border border-border rounded-[6px] text-primary text-[14px]
                       placeholder-muted focus:outline-none focus:border-accent disabled:opacity-50"
          />
        </div>

        {error && <p className="text-red-400 text-[12px]">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-accent hover:bg-accent/90 disabled:opacity-50
                     rounded-[6px] font-medium text-[14px] transition-colors"
        >
          {loading ? "Creating account..." : "Continue"}
        </button>
      </form>

      {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
        <>
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border-subtle" />
            <span className="text-[12px] text-muted">or</span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>
          <button
            onClick={() => {
              window.location.href = "/api/auth/signin/google";
            }}
            className="w-full py-2 bg-surface border border-border hover:border-accent
                       rounded-[6px] text-[14px] text-secondary hover:text-primary transition-colors"
          >
            Continue with Google
          </button>
        </>
      )}

      <p className="mt-6 text-center text-[12px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:text-accent/80">
          Log in
        </Link>
      </p>
    </div>
  );
}
