"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const plan = searchParams.get("plan") ?? "";
  const jobId = searchParams.get("jobId") ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    trackEvent("signup_submit_clicked", { surface: "standard_signup" });

    try {
      // Step 1: Create the user account
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        const message = data.error || "Signup failed";
        trackEvent("signup_api_error", { surface: "standard_signup", status: res.status, message });
        setError(message);
        return;
      }

      // Step 2: Sign in via NextAuth to get a proper JWT session
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        trackEvent("signup_signin_error_after_create", { surface: "standard_signup", message: result.error });
        setError("Account created but sign-in failed. Please log in manually.");
        router.push("/login");
        return;
      }

      window.dispatchEvent(new Event("auth-change"));
      const paymentParams = new URLSearchParams();
      if (plan) paymentParams.set("plan", plan);
      if (jobId) paymentParams.set("jobId", jobId);
      const destination = paymentParams.toString() ? `/payment?${paymentParams.toString()}` : "/";
      trackEvent("signup_success_redirect", { surface: "standard_signup", destination });
      router.push(destination);
    } catch {
      trackEvent("signup_api_error", { surface: "standard_signup", message: "network_or_unexpected_error" });
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const emailLooksValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordMeetsLength = !password || password.length >= 8;

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center text-primary">Create account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-[12px] text-secondary mb-1">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              aria-invalid={!emailLooksValid}
              className="w-full px-3 py-2 bg-surface border border-border rounded-[6px] text-primary text-[14px] focus:outline-none focus:border-accent"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-[12px] text-secondary mb-1">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading}
              aria-invalid={!passwordMeetsLength}
              className="w-full px-3 py-2 bg-surface border border-border rounded-[6px] text-primary text-[14px] focus:outline-none focus:border-accent"
              placeholder="••••••••"
            />
            <p className="text-[11px] text-muted mt-1">Use at least 8 characters.</p>
          </div>
          {error && <p className="text-red-400 text-[12px]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 rounded-[6px] font-medium text-[14px] transition-colors"
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>
        <p className="mt-4 text-center text-[12px] text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:text-accent/80">Log in</Link>
        </p>
      </div>
    </div>
  );
}
