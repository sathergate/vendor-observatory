# How Claude Code Chooses Software Vendors

A framework for understanding why certain tools get recommended over others in Claude Code sessions. Useful for evaluating your own stack decisions or calibrating Claude's recommendations.

---

## Important: How This Framework Actually Works

Claude Code does not run a decision rubric. It generates code based on statistical patterns in its training data. The factors below describe **why certain tools dominate that training distribution** — not an explicit scoring process happening at inference time.

This distinction matters for two reasons:

1. **You can't reason your way to a different recommendation.** Explaining to Claude Code that Paddle is theoretically better than Stripe won't change much. What changes recommendations is explicit instruction (your CLAUDE.md) or already having Paddle in your codebase.
2. **Recommendations reflect the past, not the present.** Claude Code's training has a cutoff. Its mental model of a tool reflects its status 12–24 months ago. The PlanetScale free tier removal is the canonical example — models trained before mid-2024 recommend it warmly despite it no longer having a free tier.

With that framing established, here's what drives the distribution.

---

## Factor 0: Existing Project Context

**This outweighs everything else.**

If Prisma is already in `package.json`, Claude Code will use Prisma. If the repo already uses `ioredis`, Claude Code will not suggest migrating to Upstash. The factors below govern recommendations on greenfield projects or when explicitly asked "what should I use." For any project with existing dependencies, those dependencies are the primary input.

Corollary: your CLAUDE.md is extraordinarily powerful. An explicit vendor preference in CLAUDE.md will override all the factors below. See the override section at the end.

---

## The 10 Distribution Factors (Ranked by Actual Influence)

### 1. Training Data Volume & Community Representation

The most structurally significant factor, underappreciated in most discussions.

**What matters:**
- Volume of GitHub repos, tutorials, blog posts, and Stack Overflow answers using this tool
- How accurately and consistently the tool's API is represented across those sources
- Whether training examples show correct, idiomatic usage vs. outdated or buggy patterns

**Why this ranks first:** Documentation quality, ecosystem fit, and integration speed (factors 3–5) are downstream of this. Clerk and Stripe generate high-quality, low-hallucination code partly because they have enormous tutorial surface area. Claude Code is more likely to produce *correct* Clerk code than correct Lucia code not because Lucia is worse, but because there's less training signal for Lucia. Community size was listed as "lower weight" in earlier versions of this framework — that was backwards.

**Implication for newer tools:** A tool that launched after the training cutoff, or that has thin GitHub/tutorial presence, will generate less confident and more error-prone integration code regardless of how good the tool actually is.

---

### 2. Integration Speed

The second dominant factor. Claude Code users want working code in minutes, and simpler APIs produce fewer hallucination failure modes.

**What matters:**
- Lines of code to first working integration
- SDK quality (TypeScript types, autocomplete, error messages)
- Config boilerplate required (files, adapters, callbacks)
- Infrastructure prereqs (Docker, connection pooling, migrations)
- API surface size — smaller surfaces mean fewer ways to generate wrong code

**Example:** Clerk auth ≈ 15 lines (provider + middleware + `auth()` call). Auth.js v5 = 50–100+ lines across multiple files (config, route handler, session callbacks, adapter, provider setup). Clerk's small API surface means there are fewer ways for the model to produce incorrect integration code.

**Example:** Drizzle ORM schema is plain TypeScript. Prisma uses a custom `.prisma` DSL that requires a `generate` step. Fewer build steps = fewer failure points in generated code.

---

### 3. Serverless Compatibility

Most projects deploy to Vercel or similar. Tools assuming persistent connections or local filesystems get deprioritized.

**What matters:**
- HTTP/REST vs. persistent TCP connections
- Automatic connection pooling or manual setup required
- Edge runtime support (Vercel Edge, Cloudflare Workers)
- Cold start latency

**Example:** Turso uses HTTP (`@libsql/client`) — no pooling needed. Raw Postgres on serverless requires Neon's serverless driver or an external connection pooler.

**Example:** Upstash Redis is HTTP-based and works on edge runtimes. Standard Redis (`ioredis`) requires connection handling that maps poorly to serverless.

---

### 4. Free Tier Generosity

Most projects Claude Code works on are MVPs or prototypes. If the free tier runs out before idea validation, the tool is a liability.

**What matters:**
- Actual limits (requests, storage, MAUs, bandwidth)
- Inactivity pausing (Supabase free pauses after 7 days — a frequent pain point in training examples)
- Hard cutoffs vs. soft limits with overage charges
- Real product vs. crippled demo

**Staleness warning:** Free tier structures change frequently. The table below reflects a point-in-time snapshot; verify before committing.

| Tool | Free Tier | Notable Limit |
|---|---|---|
| Clerk | 10,000 MAU | Very generous |
| Turso | 9 GB, 25M row reads/mo | Hard to exhaust on MVP |
| Supabase | 500 MB database | Pauses on inactivity |
| Neon | 512 MB | Cold starts |
| Vercel | Hobby plan | 100 GB bandwidth |
| Fireworks AI | Pay-per-token | No minimum spend |
| PlanetScale | **None (removed 2024)** | No longer recommended for new projects |

---

### 5. Documentation Quality

Claude Code generates code based on API knowledge embedded in training. Poor or inconsistent docs produce wrong code.

**What matters:**
- Complete, copy-pasteable code examples
- TypeScript SDK types matching actual API behavior
- Descriptive error messages (not generic 500s)
- Current docs matching latest SDK version
- Next.js App Router guides (not just Pages Router)

**Gold standard:** Stripe. Every endpoint has request/response examples in multiple languages, and the API has never had breaking changes (versioned since launch). This creates an unusually clean and consistent training signal.

**Strong:** Clerk, Sentry, PostHog (Next.js-specific guides with App Router examples).

**Historical weak spots:** Auth.js v5 docs lagged behind the v4→v5 migration significantly, producing frequent integration errors in generated code — even now.

---

### 6. Stack Fit (Next.js / React / TypeScript / Vercel)

The typical greenfield stack is Next.js + React + TypeScript + Tailwind + Vercel. Tools built natively for this stack produce better generated code.

**What matters:**
- First-class Next.js App Router integration
- Exported React components (not just REST APIs)
- React Server Component compatibility
- Vercel-maintained or Vercel-optimized integration

**Example:** Clerk exports `<SignIn>`, `<UserButton>`, `<SignUp>` components. Lucia is framework-agnostic — you build all UI yourself, which means more generated code and more surface area for errors.

**Example:** Resend has `@react-email/components` — emails written in JSX. SendGrid uses Handlebars templates.

---

### 7. Reliability & Maintenance Trust

Avoid tools with frequent outages, surprise breaking changes, or abandoned maintenance. Claude Code's training encodes community sentiment about reliability, which shows up as recommendation patterns.

**What matters:**
- Breaking changes without major version bumps
- Active maintenance (commit frequency, issue response time)
- Sudden pricing/tier changes (negative trust signal)
- Single maintainer vs. funded team

**Trust signals in training data:**
- Stripe: Never made a breaking API change (versioned APIs since launch)
- Supabase: Open-source with large community — code survives even if company has issues

**Red flags encoded in training:**
- PlanetScale: Killed free tier suddenly (2024)
- Heroku: Removed free tier (2022)
- Firebase: Reliable, but Google's product deprecation history creates uncertainty — this sentiment is present in training data

---

### 8. Security Defaults

Claude Code tends toward tools with secure-by-default APIs because training examples using them are cleaner and less error-prone. This affects recommendation patterns even when security isn't explicitly requested.

**What matters:**
- Automatic CSRF, session rotation, token refresh
- Parameterized queries by default (SQL injection prevention)
- Scoped API keys (read-only vs. admin)
- Enforced HTTPS

**Example:** Clerk handles session tokens, CSRF, token rotation, and multi-device sessions automatically. Auth.js requires configuring session strategy, CSRF tokens, and cookie settings — more configuration = more ways to generate insecure code.

**Example:** Drizzle and Prisma parameterize queries by default. Generated code using these ORMs is structurally resistant to injection vulnerabilities.

---

### 9. Cost Predictability at Scale

For users past MVP stage. Less relevant for greenfield recommendations, more relevant when the user explicitly asks about production architecture.

**What matters:**
- Pricing model (per-request, per-seat, per-MAU, flat rate)
- Usage-based surprise charges
- At what scale does self-hosting become cheaper

| Tool | At 100K users/mo | Pain point |
|---|---|---|
| Clerk | ~$1,800/mo | Consider Auth.js migration |
| Vercel | Pro $20/seat + overages | Bandwidth/function spikes |
| Supabase | $25/mo Pro (8 GB) | Heavy realtime usage |
| Turso | $29/mo Pro (24 GB) | Cheap for read-heavy |
| Fireworks AI | Linear per-token | Predictable, no surprises |

---

### 10. Escape Hatch / Vendor Lock-in

Claude Code does not noticeably penalize lock-in risk unless the user explicitly raises it. However, it does favor tools built on open standards (Postgres, SQLite, Redis) over proprietary query languages.

**What matters:**
- Standard underlying technology vs. proprietary format
- Open-source self-hosted option
- Migration difficulty

**Example:** Turso (SQLite) and Supabase (Postgres) use standard formats — dump and migrate anywhere. Fauna and Firebase Firestore use proprietary query languages that are painful to migrate from, and this sentiment appears in training data.

**Acknowledged tradeoff:** Clerk is convenient but creates lock-in. Auth.js is open-source and self-hosted. Clerk wins for MVPs (speed > portability), but the tradeoff should be flagged if the user asks.

---

## The Recommended Stack (Greenfield, Serverless, MVP)

### Infrastructure & Hosting
1. **Vercel** — Next.js deployment, serverless
2. **Netlify** — Static/JAMstack alternative
3. **AWS** (S3, Lambda, CloudFront) — When you outgrow PaaS

### Databases
4. **Supabase** — Postgres + auth + realtime + storage
5. **Turso** — SQLite at the edge
6. **Neon** — Serverless Postgres
7. **Upstash** — Serverless Redis/Kafka
8. ~~PlanetScale~~ — **Removed: no free tier as of 2024**

### Auth
9. **Clerk** — Drop-in auth with UI components (MVP default)
10. **Auth.js (NextAuth)** — Open-source, self-managed (scale default)

### ORM
11. **Drizzle** — Lightweight, type-safe
12. **Prisma** — Heavier, great DX; favored if already in project

### AI / LLM
13. **OpenAI** — GPT models; highest training data volume
14. **Anthropic** — Claude API
15. **Fireworks AI** — Multi-model, fast, cheap; thinner training signal than OpenAI/Anthropic

### Payments & Email
16. **Stripe** — Payments, subscriptions; gold standard for doc quality
17. **Resend** — Transactional email (React components)

### Monitoring
18. **Sentry** — Error tracking
19. **PostHog** — Product analytics (open-source)

### Dev Tooling
20. **GitHub** — Source control, CI/CD

---

## Summary Decision Matrix

| Factor | Actual Weight | Tools It Favors |
|---|---|---|
| Existing project context | **Dominant** | Whatever's already installed |
| CLAUDE.md overrides | **Dominant** | Whatever you specify |
| Training data volume | Very High | Stripe, Clerk, Supabase, Vercel, OpenAI |
| Integration speed | Very High | Clerk, Supabase, Vercel, Drizzle |
| Serverless compat | High | Turso, Upstash, Neon, Vercel |
| Free tier | High | Turso, Clerk, Fireworks |
| Documentation quality | High | Stripe, Clerk, Sentry |
| Stack fit | High | Clerk, Drizzle, Resend, Vercel |
| Reliability | Medium-High | Stripe, Vercel, Supabase |
| Security defaults | Medium-High | Clerk, Drizzle, Prisma |
| Cost at scale | Medium | Auth.js, Turso, self-hosted |
| Escape hatch | Medium | Supabase, Auth.js, Drizzle |

**TL;DR:** Optimized for "fastest path to working production code on a serverless stack with a generous free tier" — as of the model's training cutoff.

---

## How to Use This

### Overriding defaults in CLAUDE.md

This is the highest-leverage thing you can do. Explicit CLAUDE.md instructions override all the factors above.

```markdown
## Vendor Preferences
- Use Auth.js instead of Clerk (we need self-hosted auth)
- Use Prisma instead of Drizzle (team already knows Prisma)
- Use AWS instead of Vercel (cost control at scale)
- Do not recommend PlanetScale (no free tier)
```

### Compensating for training staleness

For tools that have changed significantly since 2023–2024, paste current documentation or a changelog summary into context. Claude Code will use it.

```
Here's the current Upstash pricing page [paste]. Use this instead of whatever
you know from training when making architecture recommendations.
```

### Evaluating an unfamiliar tool

If you're evaluating whether Claude Code can reliably generate code for a tool you've chosen:
- Search GitHub for `[tool-name] site:github.com` — high repo count = higher training signal
- Look for Next.js App Router examples specifically (Pages Router examples produce subtly wrong code)
- If thin, plan to paste official docs into context on every session

### Using this framework for investment signal

The tools highest on this list are disproportionately likely to be recommended to developers using AI coding assistants. Distribution through AI-generated code is an emerging acquisition channel worth tracking independently of traditional developer mindshare metrics.
