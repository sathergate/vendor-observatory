# Feature Flags

All flags are env-based. Set `FLAG_<NAME>=true` in `.env.local` or deployment environment.

| Flag | Default | Purpose |
|------|---------|---------|
| `FLAG_IA_V2` | OFF | IA v2 shell navigation (Home/Performance/Reasons/Fixes/Evidence/Lab) |
| `FLAG_VENDOR_SURFACE_V2` | OFF | Vendor detail actions-first layout |
| `FLAG_DATA_SOURCE_SPLIT` | OFF | Benchmark vs organic data source separation in UI |
| `FLAG_AGENT_LEGIBILITY` | OFF | Agent Legibility Signals replacing AI-readiness grades |
| `FLAG_EVIDENCE_LINKS` | OFF | Mandatory evidence links on recommendations |
| `FLAG_REMEDIATION` | OFF | Loss→remediation workflow with issue tracking |
| `FLAG_ONBOARDING_DIAGNOSIS` | OFF | Show diagnosis before payment gate |
| `FLAG_REASONS_EVIDENCE` | OFF | Enhanced Reasons + Evidence core flows |
| `FLAG_DOCS_REMEDIATION` | OFF | Docs/SDK remediation generator |
| `FLAG_LAB` | OFF | Lab area with query builder + saved analyses |
| `FLAG_LANDING_AB` | OFF | Landing page A/B test + instrumentation |

## Rollback

Disable any flag by removing or setting to `false`. No code changes needed.

## Implementation

Flags are defined in `apps/web/src/lib/flags.ts`. Server components read them directly.
Client components receive flag values as props from server parents.
