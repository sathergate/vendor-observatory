# Funnel Map

Default workspace: `/Users/jalcorn/vendor-observatory`

## Target Attempt 4 funnel

`/get-started/signup` -> `/get-started/analyze` -> `/get-started/[jobId]` -> `/get-started/[jobId]/scorecard` -> `/plans` -> `/payment` -> Stripe checkout/webhook -> `/overview`

This is the intended end state for the signup/paywall flow, even though the current cloud repo does not yet contain the full route set.

## Current cloud-repo route map

| Route | Current role | Key inputs | Expected output / next hop |
| --- | --- | --- | --- |
| `/signup` | Current signup UI | `email`, `password` | Calls `/api/auth/signup`, dispatches `auth-change`, then pushes `/` |
| `/api/auth/signup` | Account creation API | JSON `email`, `password` | Creates user, creates session cookie, returns success or validation/conflict error |
| `/login` | Current login UI | auth form inputs | Routes existing users into the authenticated app |
| `/api/auth/login` | Login API | JSON credentials | Verifies user and creates session cookie |
| `/api/auth/logout` | Logout API | current session | Clears session cookie |
| `/api/auth/me` | Session introspection | current session | Returns current user or 401 |
| `apps/web/src/middleware.ts` | Access control gate | pathname, session cookie | Allows public routes and rejects or redirects unauthenticated requests |

## Missing from current cloud repo

These are part of the intended Attempt 4 flow but are not present in this checkout today:

- `/get-started/signup`
- `/get-started/analyze`
- `/get-started/[jobId]`
- `/get-started/[jobId]/scorecard`
- `/plans`
- `/payment`
- `/payment/success`
- `/api/onboard/*`
- `/api/stripe/checkout`
- `/api/stripe/webhook`

When reviewing this repo, treat absence of these routes as a concrete implementation gap, not as permission to ignore them.

## Current divergence points to inspect

1. The cloud repo still terminates signup at `/signup` -> `/`, not the intended Attempt 4 onboarding funnel.
2. There is no route-level support yet for `jobId`, `plan`, or vendor-aware payment handoffs.
3. There are no Stripe or onboarding routes in this checkout, so payment activation cannot currently be validated here.
4. CI runs unit tests only.
5. Deployment verification checks health/data endpoints only, not signup or payment behavior.

## Repo areas to inspect now

### Existing auth and access-control surface

- `apps/web/src/app/signup/page.tsx`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/api/auth/signup/route.ts`
- `apps/web/src/app/api/auth/login/route.ts`
- `apps/web/src/app/api/auth/logout/route.ts`
- `apps/web/src/app/api/auth/me/route.ts`
- `apps/web/src/app/api/auth/routes.test.ts`
- `apps/web/src/middleware.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

### Target files to inspect when Attempt 4 lands in a branch or PR

- `apps/web/src/app/(public)/get-started/signup/page.tsx`
- `apps/web/src/app/(public)/get-started/analyze/page.tsx`
- `apps/web/src/app/(public)/get-started/[jobId]/page.tsx`
- `apps/web/src/app/(public)/get-started/[jobId]/scorecard/page.tsx`
- `apps/web/src/app/(public)/plans/page.tsx`
- `apps/web/src/app/(public)/payment/page.tsx`
- `apps/web/src/app/(public)/payment/PaymentForm.tsx`
- `apps/web/src/app/(public)/payment/success/SuccessContent.tsx`
- `apps/web/src/app/api/onboard/analyze/route.ts`
- `apps/web/src/app/api/onboard/analyze/[jobId]/route.ts`
- `apps/web/src/app/api/onboard/analyze/[jobId]/email/route.ts`
- `apps/web/src/app/api/stripe/checkout/route.ts`
- `apps/web/src/app/api/stripe/webhook/route.ts`

## Review focus by stage

- Current signup: user creation, session cookie issuance, redirect destination, password validation
- Target onboarding: domain or URL capture, `jobId` creation, scorecard gating, plan selection, payment routing
- Payment activation: vendor resolution, checkout metadata, webhook activation, no plaintext PII logging
- Verification: unit tests plus end-to-end funnel and deploy validation
