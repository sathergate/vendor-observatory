"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "success";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Login failed");
        return;
      }
      window.dispatchEvent(new Event("auth-change"));
      // Redirect to user's vendor profile page
      try {
        const meRes = await fetch("/api/auth/me");
        const meData = await meRes.json();
        const vendor = meData?.subscription?.vendorCanonicalId;
        if (vendor) {
          router.push(`/benchmarks/vendors/${vendor}`);
          return;
        }
      } catch {}
      router.push("/");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center text-primary">Log in</h1>
        {resetSuccess && (
          <p className="text-green-400 text-[12px] text-center mb-4">
            Your password has been reset successfully. Please log in with your new password.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-[12px] text-secondary mb-1">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-[6px] text-primary text-[14px] focus:outline-none focus:border-accent"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" className="block text-[12px] text-secondary">Password</label>
              <Link href="/forgot-password" className="text-[11px] text-accent hover:text-accent/80">Forgot password?</Link>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-[6px] text-primary text-[14px] focus:outline-none focus:border-accent"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-red-400 text-[12px]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 rounded-[6px] font-medium text-[14px] transition-colors"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>
        <p className="mt-4 text-center text-[12px] text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-accent hover:text-accent/80">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
