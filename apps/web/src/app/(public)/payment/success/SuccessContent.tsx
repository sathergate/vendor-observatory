"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/overview");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <>
      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-900/40 border border-green-700 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-bold mb-2">Payment successful</h1>
      <p className="text-gray-400 mb-8">
        Your subscription is active. You now have full access to the Vendor
        Observatory dashboard.
      </p>

      {sessionId && (
        <p className="text-xs text-gray-600 mb-6 font-mono break-all">
          Session: {sessionId}
        </p>
      )}

      <a
        href="/overview"
        className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
      >
        Go to dashboard
      </a>

      <p className="text-sm text-gray-500 mt-4">
        Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}...
      </p>
    </>
  );
}
