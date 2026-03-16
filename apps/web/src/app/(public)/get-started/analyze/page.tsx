"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AnalyzeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilled = searchParams.get("domain") ?? "";
  const [url, setUrl] = useState(prefilled);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/onboard/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }
      router.push(`/get-started/${data.jobId}`);
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-24">
      <h1 className="text-2xl font-bold mb-2 text-center text-primary">
        {prefilled ? "Confirm your product URL" : "What\u2019s your home page?"}
      </h1>
      <p className="text-[14px] text-secondary text-center mb-8">
        {prefilled
          ? "We detected this from your email. Edit if needed."
          : "Enter your product\u2019s domain and we\u2019ll analyze how AI coding assistants mention it."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourproduct.com"
            required
            disabled={loading}
            className="w-full px-4 py-3 bg-surface border border-border rounded-[6px] text-primary text-[14px]
                       placeholder-muted focus:outline-none focus:border-accent
                       disabled:opacity-50"
          />
        </div>
        {error && <p className="text-red-400 text-[12px]">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-accent hover:bg-accent/90 disabled:opacity-50
                     rounded-[6px] font-medium text-[14px] transition-colors"
        >
          {loading ? "Analyzing..." : "Start analysis"}
        </button>
      </form>
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense>
      <AnalyzeForm />
    </Suspense>
  );
}
