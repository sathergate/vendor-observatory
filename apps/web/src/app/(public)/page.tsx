export default function LandingPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-24 text-center">
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6 text-primary">
        Measure how AI coding assistants surface your product
      </h1>
      <p className="text-[14px] text-secondary mb-10 max-w-2xl mx-auto leading-relaxed">
        See how Claude Code, Codex CLI, and Cursor mention your product in real
        developer sessions. Signal detection from actual usage — not surveys
        or polls.
      </p>
      <a
        href="/get-started/analyze"
        className="inline-block px-8 py-3 bg-accent hover:bg-accent/90 rounded-[6px] text-[14px] font-medium transition-colors"
      >
        Analyze your product &rarr;
      </a>
    </div>
  );
}
