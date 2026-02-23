"use client";

import { useState } from "react";

export function EmailAlertSignup({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/onboard/email-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <p className="text-green-400 text-sm text-center py-4">
        We&apos;ll notify you of significant changes.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        required
        disabled={loading}
        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100
                   focus:outline-none focus:border-blue-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded font-medium text-sm transition-colors"
      >
        {loading ? "..." : "Get alerts"}
      </button>
    </form>
  );
}
