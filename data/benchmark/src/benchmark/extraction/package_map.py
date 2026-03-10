"""Package name to vendor canonical ID mapping.

Port of packages/shared/src/package-map.ts
"""

from __future__ import annotations

import re

PACKAGE_TO_VENDOR: dict[str, str] = {
    # ── Database ──────────────────────────────────────────────────────
    "@supabase/supabase-js": "supabase",
    "@supabase/ssr": "supabase",
    "@supabase/auth-helpers-nextjs": "supabase",
    "supabase": "supabase",
    "@neondatabase/serverless": "neon",
    "@neon/api": "neon",
    "@libsql/client": "turso",
    "@tursodatabase/libsql-client": "turso",
    "@planetscale/database": "planetscale",
    "@cockroachdb/pg": "cockroachdb",
    "xata": "xata",
    "@xata.io/client": "xata",
    "@tidbcloud/serverless": "tidb-serverless",
    "fauna": "fauna",
    "faunadb": "fauna",
    "convex": "convex",
    "@upstash/redis": "upstash",
    "@upstash/kafka": "upstash",
    "@upstash/qstash": "upstash",
    "@upstash/ratelimit": "upstash",
    "@vercel/postgres": "vercel-postgres",
    # ── CI/CD ─────────────────────────────────────────────────────────
    "dagger-io": "dagger",
    # ── Observability ─────────────────────────────────────────────────
    "dd-trace": "datadog",
    "@datadog/browser-rum": "datadog",
    "datadog-metrics": "datadog",
    "@grafana/agent": "grafana",
    "newrelic": "new-relic",
    "@newrelic/next": "new-relic",
    "honeycomb-beeline": "honeycomb",
    "@honeycombio/opentelemetry-node": "honeycomb",
    "@axiomhq/js": "axiom",
    "@axiomhq/nextjs": "axiom",
    "@logtail/node": "betterstack",
    "@logtail/next": "betterstack",
    # ── Error Monitoring ──────────────────────────────────────────────
    "@sentry/node": "sentry",
    "@sentry/nextjs": "sentry",
    "@sentry/react": "sentry",
    "@sentry/browser": "sentry",
    "@bugsnag/js": "bugsnag",
    "@bugsnag/plugin-react": "bugsnag",
    "rollbar": "rollbar",
    # ── Feature Flags ─────────────────────────────────────────────────
    "launchdarkly-node-server-sdk": "launchdarkly",
    "@launchdarkly/node-server-sdk": "launchdarkly",
    "flagsmith": "flagsmith",
    "unleash-client": "unleash",
    "@devcycle/nodejs-server-sdk": "devcycle",
    "statsig-node": "statsig",
    "statsig-js": "statsig",
    # ── Secrets Management ────────────────────────────────────────────
    "@doppler/sdk": "doppler",
    "infisical-node": "infisical",
    "@infisical/sdk": "infisical",
    "@aws-sdk/client-secrets-manager": "aws-secrets-manager",
    # ── LLM Observability ─────────────────────────────────────────────
    "langfuse": "langfuse",
    "braintrust": "braintrust",
    "helicone": "helicone",
    "langsmith": "langsmith",
    "arize-phoenix": "arize-phoenix",
    # ── Incident Management ───────────────────────────────────────────
    "node-pagerduty": "pagerduty",
    "@pagerduty/pdjs": "pagerduty",
    # ── Security Scanning ─────────────────────────────────────────────
    "snyk": "snyk",
    "@snyk/protect": "snyk",
    # ── Edge Compute ──────────────────────────────────────────────────
    "wrangler": "cloudflare-workers",
    "@cloudflare/workers-types": "cloudflare-workers",
    "miniflare": "cloudflare-workers",
    "@deno/deploy": "deno-deploy",
    "flyctl": "fly-io",
    "@flydotio/dockerfile": "fly-io",
}


def resolve_package_to_vendor(package_name: str) -> str | None:
    """Given a package name from an install command, return the vendor canonical ID."""
    # Strip version specifiers: @supabase/supabase-js@2.0.0 → @supabase/supabase-js
    cleaned = re.sub(r"@[\d^~>=<.*]+$", "", package_name)
    return PACKAGE_TO_VENDOR.get(cleaned)
