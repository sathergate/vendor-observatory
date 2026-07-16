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
      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-raised border border-border flex items-center justify-center">
        <svg
          className="w-8 h-8 text-signal-strong"
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

      <h1 className="text-2xl font-bold mb-2 text-primary">Payment confirmed</h1>
      <p className="text-[14px] text-secondary mb-8">
        Your subscription is active. You now have full access to the Vendor
        Observatory dashboard.
      </p>

      {sessionId && (
        <p className="text-[12px] text-muted mb-6 font-data break-all">
          Session: {sessionId}
        </p>
      )}

      <a
        href="/overview"
        className="inline-block px-6 py-3 bg-accent hover:bg-accent/90 rounded-[6px] font-medium text-[14px] transition-colors"
      >
        Go to dashboard
      </a>

      <p className="text-[13px] text-muted mt-4">
        Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}...
      </p>
    </>
  );
}
