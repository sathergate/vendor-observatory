"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AnalyzePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
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
      // Don't reset loading — component will unmount on navigation
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-24">
      <h1 className="text-2xl font-bold mb-2 text-center">
        What&apos;s your home page?
      </h1>
      <p className="text-gray-400 text-center mb-8">
        Enter your product&apos;s domain and we&apos;ll analyze how AI coding
        assistants talk about it.
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
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-100
                       placeholder-gray-500 focus:outline-none focus:border-blue-500
                       disabled:opacity-50"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                     rounded-lg font-medium transition-colors"
        >
          {loading ? "Analyzing..." : "Start analysis"}
        </button>
      </form>
    </div>
  );
}
