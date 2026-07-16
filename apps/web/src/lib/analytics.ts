"use client";

export type AnalyticsEvent =
  | "landing_cta_click"
  | "diagnosis_start"
  | "diagnosis_complete"
  | "issue_created"
  | "issue_verified"
  | "signup_submit_clicked"
  | "signup_api_error"
  | "signup_signin_error_after_create"
  | "signup_success_redirect";

interface EventProperties {
  variant?: string;
  experimentId?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Track an analytics event. Currently logs to console;
 * replace with your analytics provider (PostHog, Mixpanel, etc.).
 */
export function trackEvent(event: AnalyticsEvent, properties?: EventProperties): void {
  if (typeof window === "undefined") return;

  // Log in dev, no-op in prod until analytics provider is configured
  if (process.env.NODE_ENV === "development") {
    console.log(`[analytics] ${event}`, properties);
  }

  // TODO: Wire to analytics provider
  // e.g. posthog.capture(event, properties);
}
