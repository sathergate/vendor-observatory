export default function GetStartedPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-24 text-center">
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
        Get your product recommended by AI coding assistants
      </h1>
      <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
        See how Claude Code, Codex CLI, and Cursor mention your product in real
        developer sessions. Revealed preference from actual usage — not surveys
        or polls.
      </p>
      <a
        href="/get-started/analyze"
        className="inline-block px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-lg font-medium transition-colors"
      >
        Analyze your product &rarr;
      </a>
    </div>
  );
}
