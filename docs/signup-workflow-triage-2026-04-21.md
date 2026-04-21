# End-to-End Signup Workflow Triage (April 21, 2026)

## Scope
- Public signup surfaces: `/signup` and `/get-started/signup`.
- Backend signup API: `POST /api/auth/signup`.
- Authentication wiring: NextAuth credentials + middleware access control.
- CI/CD guardrails relevant to signup reliability.

## Executive Summary
- **Signup is functionally wired end-to-end**, but there are **high-friction usability issues** and **CI signal gaps** that can delay diagnosing signup regressions.
- Most immediate user-facing risk was inconsistent client-side validation between `/signup` and `/get-started/signup`.
- Most immediate CI/CD risk is that local test execution can fail when workspace packages are not built first, even though CI currently builds before tests.

## What works today
1. `POST /api/auth/signup` validates required fields + minimum password length and returns conflict on duplicate email.
2. New accounts are created in the Auth.js `users` table via `createUser()`.
3. Frontend then performs credentials `signIn()` and transitions user onward.
4. Middleware allows public auth routes and signup pages without requiring a session.

## Triage Findings

### Critical
None found that fully blocks all signup paths in the current checked code.

### High
1. **Inconsistent form validation on `/signup` vs `/get-started/signup` (usability + conversion risk).**
   - `/get-started/signup` already had `required` + `minLength`.
   - `/signup` previously lacked these browser-native constraints, creating avoidable API round-trips and weaker inline guidance.
   - **Immediate fix applied:** `/signup` now enforces required fields, minimum password length, loading-state disablement, and lightweight invalid state hints.

### Medium
1. **Potential OAuth discoverability/config mismatch risk.**
   - Google OAuth button rendering on get-started signup depends on a public env flag, while provider configuration is server-side.
   - If only server env is set, OAuth can be configured but hidden from users.
   - Recommendation: align a single source of truth for OAuth availability (server-driven feature endpoint or explicit deployment contract).

2. **CI ergonomics: tests may fail locally without prior workspace build.**
   - Some tests import workspace packages that need built artifacts.
   - CI already runs build before tests, but local runs can produce false-negative failures.
   - Recommendation: encode this dependency explicitly in test scripts (e.g., `test:ci` pipeline script).

## Immediate Changes Needed (0–48 hours)

### Usability
1. **Ship consistent client-side validation everywhere signup is offered.** ✅ Done in this patch.
2. Add clear inline copy for password policy (minimum 8 chars). ✅ Done in this patch.
3. Add analytics events for key drop-off points:
   - `signup_submit_clicked`
   - `signup_api_error`
   - `signup_signin_error_after_create`
   - `signup_success_redirect`

### CI/CD
1. Add a dedicated **signup workflow smoke suite** in CI:
   - API contract tests for `/api/auth/signup`.
   - UI tests for both signup entry points.
   - Post-signup sign-in transition test.
2. Add a single canonical command in root `package.json` (e.g., `pnpm run test:ci`) that always builds required workspace packages before running web tests.
3. Add PR check annotation that fails fast when auth/signup tests are skipped or quarantined.

### Operational Readiness
1. Add alerting on signup failure rate (HTTP 4xx/5xx + NextAuth credential sign-in failure ratio).
2. Add dashboard panel specifically for signup funnel:
   - page view → submit → account created → signed in → destination reached.
3. Add runbook entry for “account created but sign-in failed” incidents.

## Validation performed during triage
- Full workspace build succeeds.
- Web test suite passes when run after build.

## Recommended next sprint backlog
1. End-to-end Playwright/Cypress happy-path + duplicate email + weak password scenarios.
2. OAuth availability contract test to prevent hidden provider buttons.
3. Error copy standardization between signup entry points and login recovery paths.
