"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-[480px] mx-auto mt-24 text-center">
      <h2 className="text-[24px] font-bold text-primary">Something went wrong</h2>
      <p className="text-[14px] text-secondary mt-2">
        An error occurred while loading this page.
      </p>
      <button
        onClick={reset}
        className="mt-6 px-4 py-2 bg-accent hover:bg-accent/90 text-primary rounded-[6px] text-[14px] font-medium transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
