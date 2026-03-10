export default function LandingPage() {
  return (
    <div className="min-h-[calc(100dvh-57px)] flex flex-col">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="flex-1 flex items-center justify-center px-6 py-24 sm:py-32">
        <div className="max-w-2xl">
          <p className="font-mono text-[12px] uppercase tracking-widest text-muted mb-6">
            Revealed preference, not stated preference
          </p>
          <h1 className="text-[2.25rem] sm:text-[3rem] font-medium tracking-tight leading-[1.1] text-primary mb-6">
            See what AI coding assistants actually recommend
          </h1>
          <p className="text-[15px] text-secondary leading-relaxed max-w-lg mb-10">
            We analyze real Claude Code, Codex CLI, and Cursor transcripts to
            measure how often your product gets mentioned, installed, and
            configured in developer sessions.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="/get-started/analyze"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 rounded-full text-[14px] font-medium transition-colors"
            >
              Analyze your product
              <span aria-hidden="true">&rarr;</span>
            </a>
            <a
              href="/login"
              className="text-[14px] text-secondary hover:text-primary transition-colors"
            >
              Sign in
            </a>
          </div>
        </div>
      </section>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="h-px bg-border-subtle" />

      {/* ── Terminal demo ─────────────────────────────────────────────── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="max-w-2xl mx-auto">
          <p className="font-mono text-[12px] uppercase tracking-widest text-muted mb-8">
            Signal detection
          </p>
          <div className="bg-surface border border-border-subtle rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-2 font-mono text-[12px] text-muted">transcript analysis</span>
            </div>
            <div className="p-5 font-mono text-[13px] leading-relaxed space-y-3">
              <div className="text-muted">
                <span className="text-secondary">$</span> observatory scan --source claude-code
              </div>
              <div className="text-muted">
                scanning ~/.claude/projects/**/*.jsonl
              </div>
              <div className="text-muted">
                found <span className="text-primary">2,847</span> sessions across <span className="text-primary">412</span> projects
              </div>
              <div className="h-px bg-border-subtle my-2" />
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-secondary">supabase</span>
                  <span className="text-data-1">████████████████░░░░ <span className="text-primary">847</span></span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">prisma</span>
                  <span className="text-data-2">██████████████░░░░░░ <span className="text-primary">712</span></span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">stripe</span>
                  <span className="text-data-3">████████████░░░░░░░░ <span className="text-primary">623</span></span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">vercel</span>
                  <span className="text-data-4">██████████░░░░░░░░░░ <span className="text-primary">501</span></span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">tailwind</span>
                  <span className="text-data-5">████████░░░░░░░░░░░░ <span className="text-primary">489</span></span>
                </div>
              </div>
              <div className="h-px bg-border-subtle my-2" />
              <div className="text-muted">
                <span className="text-data-1">■</span> installed{" "}
                <span className="text-data-2">■</span> configured{" "}
                <span className="text-data-3">■</span> recommended{" "}
                <span className="text-data-4">■</span> mentioned{" "}
                <span className="text-data-5">■</span> compared
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="h-px bg-border-subtle" />

      {/* ── How it works ──────────────────────────────────────────────── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="max-w-2xl mx-auto">
          <p className="font-mono text-[12px] uppercase tracking-widest text-muted mb-8">
            How it works
          </p>
          <div className="space-y-12">
            <div>
              <p className="font-mono text-[14px] text-primary mb-2">
                01 &mdash; Ingest transcripts
              </p>
              <p className="text-[14px] text-secondary leading-relaxed">
                We scan JSONL conversation logs from Claude Code and Codex CLI.
                Every user message, assistant response, and tool invocation is parsed.
              </p>
            </div>
            <div>
              <p className="font-mono text-[14px] text-primary mb-2">
                02 &mdash; Extract signals
              </p>
              <p className="text-[14px] text-secondary leading-relaxed">
                Package installs, config file writes, import statements, and text
                mentions are matched against a 60-vendor taxonomy. Each signal is
                classified by action type: installed, configured, recommended,
                compared, or rejected.
              </p>
            </div>
            <div>
              <p className="font-mono text-[14px] text-primary mb-2">
                03 &mdash; Measure presence
              </p>
              <p className="text-[14px] text-secondary leading-relaxed">
                See how your product ranks across thousands of real developer
                sessions. Compare against competitors. Track changes over time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="h-px bg-border-subtle" />

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-primary mb-4">
            What are AI assistants saying about your product?
          </h2>
          <p className="text-[14px] text-secondary mb-8">
            Enter your domain. Get a report in under a minute.
          </p>
          <a
            href="/get-started/analyze"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 rounded-full text-[14px] font-medium transition-colors"
          >
            Start free analysis
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="h-px bg-border-subtle" />
      <footer className="px-6 py-8">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="font-mono text-[12px] text-muted">
            vendor observatory
          </span>
          <span className="font-mono text-[12px] text-muted">
            signal &gt; noise
          </span>
        </div>
      </footer>
    </div>
  );
}
