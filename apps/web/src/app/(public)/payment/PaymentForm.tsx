"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter — $99 / month",
  growth: "Growth — $399 / month",
};

const PLAN_FEATURES: Record<string, string[]> = {
  starter: [
    "1 answer engine",
    "Up to 50 scenarios analyzed",
    "Weekly scorecard updates",
    "Email alerts on significant changes",
  ],
  growth: [
    "3 answer engines",
    "Up to 100 scenarios analyzed",
    "Daily scorecard updates",
    "Email alerts + competitor tracking",
  ],
};

interface PaymentFormProps {
  vendorId: string | null;
  vendorName: string | null;
}

export default function PaymentForm({ vendorId, vendorName }: PaymentFormProps) {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") ?? "starter";
  const canceled = searchParams.get("canceled") === "1";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCheckout() {
    if (!vendorId) {
      setError("Could not determine your vendor. Please start from the analysis page.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, vendorId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to start checkout");
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {canceled && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 mb-6 text-center">
          <p className="text-yellow-300 text-sm">
            Payment was canceled. You can try again when you&apos;re ready.
          </p>
        </div>
      )}

      {/* Plan summary */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 mb-6">
        <p className="text-sm text-gray-400 mb-1">Selected plan</p>
        <p className="text-lg font-semibold mb-3">
          {PLAN_LABELS[plan] ?? plan}
        </p>
        {PLAN_FEATURES[plan] && (
          <ul className="space-y-1.5">
            {PLAN_FEATURES[plan].map((f) => (
              <li
                key={f}
                className="text-sm text-gray-300 flex items-start gap-2"
              >
                <span className="text-green-400 mt-0.5">&#10003;</span>
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Vendor display (resolved from onboarding analysis) */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 mb-6">
        <p className="text-sm text-gray-400 mb-1">Monitoring</p>
        {vendorId ? (
          <>
            <p className="text-lg font-semibold">{vendorName ?? vendorId}</p>
            <p className="text-xs text-gray-500 mt-2">
              Your dashboard will show analytics scoped to this vendor.
            </p>
          </>
        ) : (
          <p className="text-sm text-yellow-300">
            Could not detect your vendor.{" "}
            <a href="/get-started/analyze" className="underline hover:text-yellow-200">
              Start a new analysis
            </a>{" "}
            to continue.
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-6 text-center">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Checkout button */}
      <button
        onClick={handleCheckout}
        disabled={loading || !vendorId}
        className="block w-full text-center py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
      >
        {loading ? "Redirecting to checkout..." : "Continue to payment"}
      </button>

      <p className="text-xs text-gray-500 text-center mt-4">
        You&apos;ll be redirected to Stripe to securely enter your payment
        details. You can cancel anytime from your account settings.
      </p>

      {/* Change plan link */}
      <div className="mt-6 text-center">
        <a
          href="/plans"
          className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
        >
          &larr; Change plan
        </a>
      </div>
    </>
  );
}
