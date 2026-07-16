# Current Information Architecture

## Route Groups
- **(public)**: Unauthenticated — landing, auth, onboarding, billing
- **(dashboard)**: Authenticated + paid — all product features

## Dashboard Auth Gate
`apps/web/src/app/(dashboard)/layout.tsx` checks `getCurrentUser()` → redirects to `/login` if unauthenticated, then `hasActivePayment()` → redirects to `/plans` if unpaid.

## Sidebar Navigation
File: `apps/web/src/components/Sidebar.tsx`

Legacy navigation now renders the core product areas whether or not a vendor has been selected:
- Benchmarks: Vendor Intel, Prompt Intel
- Analytics: Query, Search, Insights
- Data: Vendors, Platforms, Actions, Sessions

When a vendor is selected, the vendor-scoped links render above those global product areas:
- My Dashboard
- Rejections
- Sessions

This keeps vendor-specific workflows prominent while preserving reachability for the rest of the dashboard.

## Dashboard Pages
| Route | Purpose |
|-------|---------|
| `/benchmarks` | Overview with stats, intent distribution, category grid |
| `/benchmarks/vendors` | Vendor Intel index with AI-Readiness leaderboard |
| `/benchmarks/vendors/[vendor]` | Vendor scorecard (3 tabs: Overview, Signals, Actions) |
| `/benchmarks/vendors/[vendor]/*` | Sub-pages: use-cases, implementation, competitive, reasoning, trends, category-competition |
| `/benchmarks/prompts` | Prompt-level intel |
| `/benchmarks/[category]` | Category-specific benchmarks |
| `/query` | Composable query builder (6 query types) |
| `/search` | Full-text semantic search |
| `/insights` | Cross-session analytics |
| `/vendors` | Vendor frequency table |
| `/platforms` | Platform comparison (Claude Code vs Codex CLI) |
| `/actions` | Detection funnel |
| `/sessions` | Sessions list |
| `/sessions/[id]` | Session transcript detail |
| `/rejections` | Vendor rejections (5 tabs) |

## Scoring
- AI-Readiness grade (A-F) in `apps/web/src/lib/recommendations.ts`
- Worker scorer in `packages/worker/src/scorer.ts` (mention*40% + install*40% + config*20%)

## Data Source Separation
`sessions.is_benchmark` exists in DB schema but is NOT surfaced in dashboard UI. No toggle between benchmark and organic data.
