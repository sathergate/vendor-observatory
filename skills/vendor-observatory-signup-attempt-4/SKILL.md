---
name: vendor-observatory-signup-attempt-4
description: Audit, implement, and validate the vendor-observatory signup and paywall funnel selected as Attempt 4. Use when working on the current /signup auth flow, implementing the intended /get-started onboarding funnel, adding plans or payment handoffs, introducing Stripe checkout or webhook behavior, tightening middleware exposure, or deciding whether the end-to-end signup path is actually ready to ship.
---

# Vendor Observatory Signup Attempt 4

Use this skill for vendor-observatory work on signup, onboarding, paywall, payment activation, or "is signup done?" validation.

Default repo target: `/Users/jalcorn/vendor-observatory`.

## Target Attempt 4 funnel

Treat this as the intended Attempt 4 path unless the user explicitly says the product direction changed:

`/get-started/signup` -> `/get-started/analyze` -> `/get-started/[jobId]` -> `/get-started/[jobId]/scorecard` -> `/plans` -> `/payment` -> Stripe checkout/webhook -> `/overview`

The legacy `/signup` flow is compat only. Keep it aligned with the canonical flow or redirect it deliberately. Do not let it silently diverge.

## Current cloud-repo reality

On `main`, this repo is earlier than the full Attempt 4 implementation:

- `/signup` and `/api/auth/*` exist
- middleware exists
- `get-started`, `plans`, `payment`, `api/onboard`, and `api/stripe` routes do not exist in this checkout

Do not confuse "missing from this repo today" with "not part of Attempt 4." Missing routes are part of the implementation gap that this skill should surface.

Read [references/funnel-map.md](references/funnel-map.md) before proposing changes.

## Workflow

### 1. Map the live funnel first

Before proposing fixes, confirm what this checkout actually contains:

- Is the repo still limited to `/signup` and auth routes?
- Is a branch or PR introducing `/get-started`, `plans`, `payment`, or Stripe routes?
- Does the existing `/signup` flow create a user, establish a session, and route somewhere sensible?
- Are there route gaps that make the claimed Attempt 4 funnel impossible in the current checkout?

### 2. Compare current state to the Attempt 4 target

Bias toward the full `get-started` onboarding flow:

- account creation on `/get-started/signup`
- immediate credential sign-in after account creation
- domain or URL handoff into analysis
- scorecard-to-plan paywall
- vendor-aware payment after `jobId` resolution
- Stripe webhook activation before dashboard access

If the repo still routes users only through `/signup`, treat that as a gap relative to Attempt 4, not proof that the work is complete.

### 3. Verify the critical handoffs

Do not mark the funnel healthy unless the relevant handoffs for the checkout under review actually exist and work:

- `/api/auth/signup` creates the user and returns a usable success response
- the frontend establishes an authenticated session immediately after signup
- when the full funnel exists, required context survives the handoffs: `email`, `jobId`, `plan`
- when payment exists, vendor resolution from `jobId` works before checkout
- when Stripe exists, checkout metadata and webhook activation are correct
- the post-payment user lands in the dashboard flow after success

Read [references/validation-checklist.md](references/validation-checklist.md) before concluding the work.

### 4. Audit security and operability, not just happy-path UX

Treat these as first-class checks:

- least-privilege middleware exposure, especially public auth, onboarding, and Stripe routes
- no plaintext customer-email logging in Stripe webhook logs
- no vendor-resolution gaps between scorecard, plans, payment, and webhook activation
- no password UX drift between current `/signup` and the intended `/get-started/signup`
- CI and deploy verification that exercise the real funnel instead of only unit tests or `/api/health`

## Blocking findings

Call these out as blocking until fixed or explicitly accepted:

- the cloud repo still lacks the route set required for the intended Attempt 4 funnel
- legacy `/signup` bypasses or diverges from the Attempt 4 onboarding path
- broken propagation of `email`, `jobId`, or `plan`
- `/payment` cannot derive a valid vendor from `jobId`
- `/api/stripe/` is public via a broad prefix instead of explicit route allowlisting
- Stripe webhook logs expose customer email in plaintext
- the repo has no real end-to-end signup funnel coverage
- deploy verification only checks health/data endpoints and never probes signup/payment behavior

## Response standard

When the user asks whether signup is fixed, done, or safe to ship:

- do not rely on unit tests alone
- do not accept a passing `/api/health` check as sufficient
- require relevant unit coverage plus a full funnel test strategy and deploy-path verification
- state clearly which step in the funnel is missing or unverified if the full Attempt 4 route set is not present

## Reference loading

- Read [references/funnel-map.md](references/funnel-map.md) first for the current cloud-repo route map and target-state gaps.
- Read [references/validation-checklist.md](references/validation-checklist.md) before implementation review, verification, or ship/no-ship conclusions.
