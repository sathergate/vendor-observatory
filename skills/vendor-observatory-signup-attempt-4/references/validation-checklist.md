# Validation Checklist

Use this checklist before saying the vendor-observatory signup funnel is fixed, healthy, or ready to ship.

## Current-cloud-repo baseline

- [ ] The review states clearly whether it is evaluating the current cloud repo only or a branch that includes the fuller Attempt 4 funnel
- [ ] Missing `get-started`, `plans`, `payment`, `onboard`, or `stripe` routes are called out explicitly when absent

## Funnel consistency

- [ ] `/get-started/signup` is treated as canonical when the Attempt 4 route set exists
- [ ] Legacy `/signup` is either aligned with the canonical flow or intentionally redirected
- [ ] The current cloud repo does not claim Attempt 4 completeness if it still ends at `/signup` -> `/`

## Password UX and signup parity

- [ ] Current `/signup` enforces intentional password requirements
- [ ] Any future `/get-started/signup` keeps compatible or deliberately improved password UX
- [ ] Signup errors surface actionable messages for missing fields, weak password, and duplicate email

## Auth and session continuity

- [ ] User creation succeeds through `/api/auth/signup`
- [ ] Signup establishes an authenticated session immediately
- [ ] The resulting session is recognized by downstream pages and API routes
- [ ] Failed post-signup sign-in or session setup is handled explicitly

## Query-param and state propagation

- [ ] When the full funnel exists, `email` survives the handoff from scorecard into plans
- [ ] When the full funnel exists, `jobId` survives the handoff from scorecard into plans and payment
- [ ] When the full funnel exists, `plan` survives the handoff from plans into payment and checkout
- [ ] No funnel step drops required context and forces guesswork later

## Vendor resolution and payment correctness

- [ ] `/payment` can resolve `vendorId` from `jobId` when payment exists
- [ ] Payment blocks cleanly when vendor resolution fails
- [ ] `/api/stripe/checkout` requires the right plan and vendor inputs
- [ ] Checkout metadata includes the plan and vendor needed by the webhook
- [ ] Success and cancel URLs return the user to sensible next steps

## Webhook correctness and logging

- [ ] `/api/stripe/webhook` activates or updates the correct subscription record
- [ ] Webhook processing does not log customer email in plaintext
- [ ] Missing-user or invalid-event paths fail safely and visibly

## Middleware and least privilege

- [ ] Public page allowlists are intentional and minimal
- [ ] Public API allowlists are intentional and minimal
- [ ] Stripe exposure is explicit per route, not a blanket `/api/stripe/` prefix
- [ ] Authenticated pages and APIs reject unauthenticated access consistently

## Test and deploy proof

- [ ] Relevant unit tests cover the changed auth, onboarding, payment, or middleware logic
- [ ] There is a real end-to-end test strategy for the signup funnel
- [ ] Verification covers the actual signup/paywall/payment flow, not only `/api/health`
- [ ] Deployment gating proves the funnel works before or at least immediately after promotion

## Ship / no-ship rule

If any checked item above still lacks proof, say exactly which funnel step is missing or unverified and do not describe the signup flow as done.
