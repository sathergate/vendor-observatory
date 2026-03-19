# How Claude Code Chooses Software Vendors

A framework for understanding why certain tools get recommended over others in Claude Code sessions. Useful for evaluating your own stack decisions or calibrating Claude's recommendations.

---

## Important: How This Framework Actually Works

Claude Code does not run a decision rubric. It generates code based on patterns shaped by training data, RLHF tuning, ecosystem signals, and (increasingly) direct tool access via MCP. The factors below describe **why certain tools dominate recommendations** — not an explicit scoring process at inference time.

This distinction matters for three reasons:

1. **You can't reason your way to a different recommendation.** Explaining to Claude Code that Paddle is theoretically better than Stripe won't change much. What changes recommendations is explicit instruction (your CLAUDE.md) or already having Paddle in your codebase.
2. **Recommendations reflect the past, not the present.** Claude Code's training has a cutoff. Its mental model of a tool reflects its status 12–24 months ago. The PlanetScale free tier removal is the canonical example — models trained before mid-2024 recommend it warmly despite it no longer having a free tier.
3. **Training data volume does not predict recommendation rate.** MongoDB has 10.8 million weekly npm downloads and 200,000+ Stack Overflow questions — dwarfing Supabase's footprint — yet receives zero primary database picks. Training data determines which tools are *visible* to the model, but other factors determine which tools get *chosen*.

With that framing established, here's what drives the distribution.

---

## Why Training Data Alone Doesn't Explain Recommendations

Before the factor ranking, it's worth understanding what the data actually shows. The Amplifying.AI study (February 2026) tested 2,430 open-ended prompts to Claude Code across three models, four greenfield repos, and 20 tool categories. No tool names appeared in any prompt.

| Vendor | npm Downloads (weekly) | SO Questions (est.) | Claude Code Primary Pick Rate | Ratio: Picks / M Downloads |
|---|---|---|---|---|
| Supabase | 5.2M | ~5–10K | 24% (database) | ~4.6 |
| MongoDB | 10.8M | ~200K+ | 0% (database) | 0 |
| Firebase | 3.1M (JS SDK) | ~250K+ | ~0% (database) | 0 |
| Resend | ~200–500K | ~100–300 | 62.7% (email) | ~125–313 |
| Drizzle ORM | 5.0M | ~1–3K | 61% (Next.js ORM) | ~12.2 |

The ratio of recommendation rate to training data volume varies by orders of magnitude — from zero (MongoDB, Firebase) to triple digits (Resend). A single-factor model based on training data volume cannot explain this. The factors below reflect the actual multi-causal structure.

---

## Factor 0: Existing Project Context

**This outweighs everything else.**

If Prisma is already in `package.json`, Claude Code will use Prisma. If the repo already uses `ioredis`, Claude Code will not suggest migrating to Upstash. The factors below govern recommendations on greenfield projects or when explicitly asked "what should I use." For any project with existing dependencies, those dependencies are the primary input.

Corollary: your CLAUDE.md is extraordinarily powerful. An explicit vendor preference in CLAUDE.md will override all the factors below. See the override section at the end.

---

## The Distribution Factors (Ranked by Actual Influence)

### 1. Ecosystem Graph Position

The factor that explains the largest variance in recommendation rates across vendors.

**What matters:**
- Whether the tool sits at a hub in the Next.js / React / TypeScript / Vercel dependency chain
- How many framework integration points the tool touches (database, auth, storage, realtime, edge functions)
- Whether the tool has built upstream open-source libraries that create dependency chains

**Why this ranks first:** PocketBase has 56,800 GitHub stars — more than Prisma, Drizzle, or Hasura — yet receives near-zero Claude Code recommendations. The reason: PocketBase is a Go binary with minimal JavaScript SDK usage. It sits outside the ecosystem graph that Claude Code activates. Conversely, Supabase bundles database + auth + storage + realtime, occupying multiple graph nodes simultaneously and winning queries across multiple categories.

**Ecosystem plays matter more than raw presence:** Resend captures 62.7% of email recommendations despite modest npm downloads because it built React Email (~15K GitHub stars), creating a dependency chain: Next.js → React → React Email → Resend. This embeds Resend's API patterns into thousands of repos. SendGrid, with far more training data, lacks this structural advantage.

---

### 2. Integration Speed

Claude Code users want working code in minutes, and simpler APIs produce fewer hallucination failure modes.

**What matters:**
- Lines of code to first working integration
- SDK quality (TypeScript types, autocomplete, error messages)
- Config boilerplate required (files, adapters, callbacks)
- Infrastructure prereqs (Docker, connection pooling, migrations)
- API surface size — smaller surfaces mean fewer ways to generate wrong code

**Example:** Clerk auth ≈ 15 lines (provider + middleware + `auth()` call). Auth.js v5 = 50–100+ lines across multiple files (config, route handler, session callbacks, adapter, provider setup). Clerk's small API surface means there are fewer ways for the model to produce incorrect integration code.

**Example:** Drizzle ORM schema is plain TypeScript. Prisma uses a custom `.prisma` DSL that requires a `generate` step. Fewer build steps = fewer failure points in generated code.

---

### 3. Sentiment & Trust Signals

The *sign* of training data matters as much as volume. Negative developer sentiment actively suppresses recommendations regardless of how much training data exists.

**What matters:**
- Net developer experience sentiment (positive vs. negative signals in training data)
- Breaking changes without major version bumps
- Sudden pricing/tier changes (strong negative trust signal)
- Active maintenance (commit frequency, issue response time)
- Whether the tool is associated with complexity complaints or migration pain

**Negative sentiment suppresses volume:** SendGrid has far more training data than Resend, but its training data contains complexity complaints, deprecated API references, and Twilio acquisition concerns. Claude Code recommends Resend instead. PlanetScale's free tier removal created such strongly negative training signal that Claude has falsely claimed PlanetScale "shut down."

**Positive sentiment amplifies:** Stripe has never made a breaking API change (versioned since launch) — creating an unusually clean and consistent training signal. Supabase's open-source model and active community generate positive signals. Zustand wins 64.8% of state management picks over Redux (186K stars) partly because Redux training data is saturated with complexity complaints.

**Red flags encoded in training:**
- PlanetScale: Killed free tier suddenly (2024)
- Heroku: Removed free tier (2022)
- Firebase: Reliable, but Google's product deprecation history creates uncertainty

---

### 4. Training Data Presence (Eligibility Gate)

Training data determines which tools are *eligible* for recommendation. It does not determine which tools get *chosen* among eligible candidates.

**What matters:**
- Volume of GitHub repos, tutorials, blog posts, and Stack Overflow answers using this tool
- How accurately and consistently the tool's API is represented across those sources
- Whether training examples show correct, idiomatic usage vs. outdated or buggy patterns

**This is a gate, not a dial.** Past a threshold of sufficient presence, other factors dominate. MongoDB has 10.8M weekly npm downloads and 200K+ Stack Overflow questions — roughly 20–40× Supabase's SO footprint — yet receives zero primary database picks. Firebase has 250K+ SO questions and a decade of tutorials, yet barely registers. If training data volume were proportionally predictive, MongoDB and Firebase would dominate. They don't.

**Where volume does matter:** Training data volume strongly affects *code quality*, even when it doesn't predict recommendation frequency. Claude Code is more likely to produce correct Clerk code than correct Lucia code not because Lucia is worse, but because there's more training signal for Clerk. A tool with thin presence will generate less confident and more error-prone integration code regardless of how good the tool actually is.

---

### 5. Recency Gradient

RLHF and training procedures amplify newer patterns over older ones, even when the older tool has more raw training data.

**What matters:**
- Whether the tool aligns with current best practices vs. legacy approaches
- Developer community momentum (ascending vs. declining)
- How recently the tool's patterns entered the training distribution

**Temporal collapses are the evidence.** Prisma's recommendation rate collapsed from 79% in Sonnet 4.5 to 0% in Opus 4.6 for Next.js ORM, replaced by Drizzle (33K stars, fewer downloads). Express and AWS went from dominant to near-absent between mid-2025 and early 2026, replaced by Hono and Vercel/Railway. The total volume of Express tutorials didn't decrease — but recency-weighted training shifted preferences toward newer patterns.

**Ascending tools:** Drizzle, Zustand, Hono, Railway, Resend
**Declining tools:** Prisma (for new projects), Express, Redux, AWS (for MVP contexts)

---

### 6. Serverless Compatibility

Most projects deploy to Vercel or similar. Tools assuming persistent connections or local filesystems get deprioritized.

**What matters:**
- HTTP/REST vs. persistent TCP connections
- Automatic connection pooling or manual setup required
- Edge runtime support (Vercel Edge, Cloudflare Workers)
- Cold start latency

**Example:** Turso uses HTTP (`@libsql/client`) — no pooling needed. Raw Postgres on serverless requires Neon's serverless driver or an external connection pooler.

**Example:** Upstash Redis is HTTP-based and works on edge runtimes. Standard Redis (`ioredis`) requires connection handling that maps poorly to serverless.

---

### 7. Stack Fit (Next.js / React / TypeScript / Vercel)

The typical greenfield stack is Next.js + React + TypeScript + Tailwind + Vercel. Tools built natively for this stack produce better generated code.

**What matters:**
- First-class Next.js App Router integration
- Exported React components (not just REST APIs)
- React Server Component compatibility
- Vercel-maintained or Vercel-optimized integration

**Example:** Clerk exports `<SignIn>`, `<UserButton>`, `<SignUp>` components. Lucia is framework-agnostic — you build all UI yourself, which means more generated code and more surface area for errors.

**Example:** Resend has `@react-email/components` — emails written in JSX. SendGrid uses Handlebars templates.

---

### 8. Free Tier Generosity

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

### 9. Documentation Quality

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

### 10. MCP & Tool Integration

Direct tool access through MCP creates an independent recommendation channel that bypasses training data patterns entirely.

**What matters:**
- Whether the vendor has an official MCP server
- Whether the model can directly provision, configure, or query the vendor's service
- Whether Agent Skills or similar rules are available for the vendor

**This is a newer channel and its weight is increasing.** Supabase launched its official MCP server in March 2025, became an official Claude connector by mid-2025, and released a cloud-hosted MCP server in October 2025. Through MCP, Claude Code can directly provision Supabase databases, run migrations, and manage auth — making Supabase the path of least resistance regardless of training data.

**Each AI coding platform defaults to its integrated infrastructure:**
- Claude Code → Supabase (official connector, MCP)
- Firebase Studio → Firebase/Firestore (Google's own platform)
- Replit → Built-in PostgreSQL on Neon (proprietary integration)
- Lovable → Supabase (runs Supabase under the hood)

**MCP-integrated vendors:** Supabase, Neon (OAuth + database branching), Stripe, Sentry

---

### 11. Security Defaults

Claude Code tends toward tools with secure-by-default APIs because training examples using them are cleaner and less error-prone. This affects recommendation patterns even when security isn't explicitly requested.

**What matters:**
- Automatic CSRF, session rotation, token refresh
- Parameterized queries by default (SQL injection prevention)
- Scoped API keys (read-only vs. admin)
- Enforced HTTPS

**Example:** Clerk handles session tokens, CSRF, token rotation, and multi-device sessions automatically. Auth.js requires configuring session strategy, CSRF tokens, and cookie settings — more configuration = more ways to generate insecure code.

**Example:** Drizzle and Prisma parameterize queries by default. Generated code using these ORMs is structurally resistant to injection vulnerabilities.

---

### 12. Cost Predictability at Scale

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

### 13. Escape Hatch / Vendor Lock-in

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
1. **Vercel** — Next.js deployment, serverless; strong ecosystem position
2. **Netlify** — Static/JAMstack alternative
3. **AWS** (S3, Lambda, CloudFront) — When you outgrow PaaS

### Databases
4. **Supabase** — Postgres + auth + realtime + storage; MCP-integrated
5. **Turso** — SQLite at the edge
6. **Neon** — Serverless Postgres; MCP-integrated
7. **Upstash** — Serverless Redis/Kafka
8. ~~PlanetScale~~ — **Removed: no free tier as of 2024**

### Auth
9. **Clerk** — Drop-in auth with UI components (MVP default)
10. **Auth.js (NextAuth)** — Open-source, self-managed (scale default)

### ORM
11. **Drizzle** — Lightweight, type-safe; ascending in newer models
12. **Prisma** — Heavier, great DX; declining in newer model recommendations but favored if already in project

### AI / LLM
13. **OpenAI** — GPT models; highest training data volume
14. **Anthropic** — Claude API
15. **Fireworks AI** — Multi-model, fast, cheap; thinner training signal than OpenAI/Anthropic

### Payments & Email
16. **Stripe** — Payments, subscriptions; gold standard for doc quality
17. **Resend** — Transactional email (React components); dominant via React Email ecosystem play

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
| Ecosystem graph position | Very High | Supabase, Clerk, Vercel, Resend |
| Integration speed | Very High | Clerk, Supabase, Vercel, Drizzle |
| Sentiment & trust signals | High | Stripe, Supabase, Drizzle, Resend, Zustand |
| Training data presence | High (gate) | Stripe, Clerk, Supabase, Vercel, OpenAI |
| Recency gradient | High | Drizzle, Zustand, Hono, Railway, Resend |
| Serverless compat | High | Turso, Upstash, Neon, Vercel |
| Stack fit | High | Clerk, Drizzle, Resend, Vercel |
| Free tier | High | Turso, Clerk, Fireworks |
| Documentation quality | Medium-High | Stripe, Clerk, Sentry |
| MCP / tool integration | Medium | Supabase, Neon, Stripe, Sentry |
| Security defaults | Medium-High | Clerk, Drizzle, Prisma |
| Cost at scale | Medium | Auth.js, Turso, self-hosted |
| Escape hatch | Medium | Supabase, Auth.js, Drizzle |

**TL;DR:** Optimized for "fastest path to working production code on a serverless stack" — shaped by ecosystem position, sentiment, and recency as much as raw training data volume.

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
- Check whether the tool has an MCP server — direct tool access increasingly boosts recommendations
- If thin, plan to paste official docs into context on every session

### Using this framework for investment signal

The tools highest on this list are disproportionately likely to be recommended to developers using AI coding assistants. Distribution through AI-generated code is an emerging acquisition channel. The key insight: **raw training data volume is a poor predictor of recommendation share**. Ecosystem position, sentiment trajectory, and tool integration matter more than Stack Overflow question count.
