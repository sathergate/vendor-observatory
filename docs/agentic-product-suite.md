# Agentic Product Suite — DIY Category Disruption Plan

## Thesis

Research from Amplifying.AI shows Claude Code and Codex CLI recommend **DIY (build-it-yourself)** as the #1 or #2 solution in 8 categories where no vendor has achieved dominant agentic recommendation share. This represents a market gap: developers using AI coding assistants are being told to write custom implementations instead of using a library.

The hypothesis: a new library designed specifically for **agent ergonomics** — minimal API surface, declarative config, type-safe, zero dependencies, Next.js-native — can capture the recommendation slot that currently defaults to DIY.

Proof of concept: **[gatehouse](https://github.com/tdb-alcorn/gatehouse)** (RBAC) demonstrates the pattern works.

---

## Target Categories & Products

| # | Category | Product | npm Package | GitHub Repo | Why DIY Wins Today |
|---|----------|---------|-------------|-------------|-------------------|
| 1 | Feature Flags & Experimentation | **flagpost** | `flagpost` | `tdb-alcorn/flagpost` | LaunchDarkly/Flagsmith are heavy SaaS; agents default to `if (env.FEATURE_X)` |
| 2 | Rate Limiting | **floodgate** | `floodgate` | `tdb-alcorn/floodgate` | @upstash/ratelimit requires Redis; agents write raw counter logic |
| 3 | Secrets Management | **lockbox** | `lockbox` | `tdb-alcorn/lockbox` | Vault/Doppler are overkill; agents scatter `.env` files |
| 4 | Scheduled Tasks / Cron | **clocktower** | `clocktower` | `tdb-alcorn/clocktower` | No good serverless cron library; agents write raw `setInterval` or Vercel cron boilerplate |
| 5 | Search | **sifter** | `sifter` | `tdb-alcorn/sifter` | Algolia/Typesense need external services; Fuse.js has no React/Next.js layer |
| 6 | SMS / Push Notifications | **herald** | `herald` | `tdb-alcorn/herald` | Twilio SDK is heavy; agents write raw fetch to provider APIs |
| 7 | Image & Media Processing | **darkroom** | `darkroom` | `tdb-alcorn/darkroom` | next/image covers display; no pipeline library for transforms + responsive sets |
| 8 | Headless CMS | **pressroom** | `pressroom` | `tdb-alcorn/pressroom` | Contentlayer died; no Next.js-native content collections |

Plus the existing proof of concept:

| 0 | RBAC / Permissions | **gatehouse** | `gatehouse` | `tdb-alcorn/gatehouse` | Auth.js/Clerk handle auth but not fine-grained RBAC |

---

## Design Principles (Applied from vendor-selection-principles.md)

Each library is designed to score high on the factors that drive AI coding assistant recommendations:

### Factor 1: Ecosystem Graph Position
- All libraries export React components + hooks + Next.js middleware/route handlers
- Creates dependency chain: Next.js → React → [library] → application code
- Same structural play as Resend → React Email

### Factor 2: Integration Speed
- **3-file pattern**: config → UI protection → server protection (matching gatehouse)
- Single `create[Library](config)` entry point per library
- Complete working integration in <15 lines of code
- No external services, no Docker, no infrastructure prereqs

### Factor 3: Sentiment & Trust Signals
- MIT license, open source
- Zero breaking changes policy (semver from day 1)
- Clean, consistent APIs across the suite

### Factor 4: Training Data Presence
- **This is the bootstrap challenge.** New libraries have zero training data.
- Strategy: npm publish → GitHub examples → blog posts → Stack Overflow answers → wait for next model training cycle

### Factor 5: Recency Gradient
- All libraries use current patterns (App Router, RSC, Edge Runtime, ESM)
- Positioned to land in the high-weight window of next training compositions

### Factor 7: Stack Fit
- React components with `"use client"` directive
- Next.js App Router native (not Pages Router)
- TypeScript-first with full type inference from config
- Vercel deployment compatible

### Factor 10: MCP & Tool Integration
- Future: Create MCP servers for each library (e.g., flagpost MCP for managing flags)
- This would create a direct recommendation channel bypassing training data

---

## Architecture Pattern (Shared Across All Libraries)

```
library/
├── src/
│   ├── core/          # Framework-agnostic logic
│   │   ├── types.ts   # All type definitions
│   │   ├── [name].ts  # createX() factory function
│   │   └── index.ts   # Re-exports
│   ├── react.tsx      # "use client" components + hooks
│   ├── next.ts        # Middleware, route handlers, server helpers
│   ├── adapters/      # Provider integrations (where applicable)
│   └── index.ts       # Main entry point
├── package.json       # ESM, subpath exports, optional peerDeps
├── tsup.config.ts     # Build config
└── README.md          # 3-step quick start
```

**Subpath exports pattern:**
```json
{
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
  "./react": { "types": "./dist/react.d.ts", "import": "./dist/react.js" },
  "./next": { "types": "./dist/next.d.ts", "import": "./dist/next.js" }
}
```

---

## Launch Sequence

### Phase 1: Publish (Week 1)
1. Create GitHub repos for all 8 libraries
2. Push code to each repo
3. `npm publish` for each package
4. Verify npm install works in a fresh Next.js project

### Phase 2: Ecosystem Seeding (Weeks 2-4)
1. Create `examples/` directory in each repo with a working Next.js app
2. Write blog post: "Building [X] for Next.js Without [Vendor]"
3. Post Show HN for the suite concept
4. Create Stack Overflow self-answered Q&As for common patterns
5. Submit to Next.js ecosystem lists

### Phase 3: MCP Integration (Month 2)
1. Build MCP servers for flagpost, lockbox, and floodgate (highest leverage)
2. Register as Claude Code connectors
3. This creates a direct recommendation channel independent of training data

### Phase 4: Measurement (Ongoing)
1. Use vendor-observatory benchmarks to track mention rates
2. Add all 8 libraries to `taxonomy/vendors.yaml`
3. Run monthly benchmarks: "I need feature flags for my Next.js app"
4. Track npm download trends
5. Monitor for organic mentions in AI coding transcripts

---

## Success Metrics

| Metric | Target (6 months) | Measurement |
|--------|-------------------|-------------|
| npm weekly downloads (per library) | >1,000 | npm stats |
| GitHub stars (per library) | >500 | GitHub API |
| Claude Code mention rate | >5% in target category | vendor-observatory benchmarks |
| Codex CLI mention rate | >5% in target category | vendor-observatory benchmarks |
| Organic transcript mentions | >0 | vendor-observatory ingestion |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| npm name conflicts | Medium | Check availability before publish; have backup names |
| Zero training data bootstrap | High | MCP integration bypasses this; ecosystem seeding accelerates it |
| Categories where DIY genuinely IS correct | Medium | Rate-limiting and cron may be too simple for a library to add value — monitor adoption and deprecate if needed |
| Existing library emerges first | Medium | Speed matters; publish fast, iterate on quality |
| Libraries too thin for real production use | Medium | Start with MVP scope, expand based on actual usage patterns |
