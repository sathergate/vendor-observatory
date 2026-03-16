"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-2 text-center text-primary">
          Reset password
        </h1>
        <p className="text-[12px] text-muted text-center mb-6">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {success ? (
          <div className="space-y-4">
            <p className="text-green-400 text-[13px] text-center">
              If an account with that email exists, a password reset link has
              been sent. Please check your inbox (and spam folder).
            </p>
            <p className="text-center">
              <Link
                href="/login"
                className="text-accent hover:text-accent/80 text-[12px]"
              >
                Back to login
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-[12px] text-secondary mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-[6px] text-primary text-[14px] focus:outline-none focus:border-accent"
                placeholder="you@example.com"
                required
              />
            </div>
            {error && <p className="text-red-400 text-[12px]">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 rounded-[6px] font-medium text-[14px] transition-colors"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        {!success && (
          <p className="mt-4 text-center text-[12px] text-muted">
            <Link href="/login" className="text-accent hover:text-accent/80">
              Back to login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
