/**
 * Maps npm/pip/brew package names to vendor canonical IDs.
 * When an AI assistant runs `npm install @supabase/supabase-js`,
 * this map resolves it to the canonical vendor ID "supabase".
 */
export const PACKAGE_TO_VENDOR: Record<string, string> = {
  // ── Database ──────────────────────────────────────────────────────
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

  // ── CI/CD ─────────────────────────────────────────────────────────
  "dagger-io": "dagger",

  // ── Observability ─────────────────────────────────────────────────
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

  // ── Error Monitoring ──────────────────────────────────────────────
  "@sentry/node": "sentry",
  "@sentry/nextjs": "sentry",
  "@sentry/react": "sentry",
  "@sentry/browser": "sentry",
  "@bugsnag/js": "bugsnag",
  "@bugsnag/plugin-react": "bugsnag",
  "rollbar": "rollbar",

  // ── Feature Flags ─────────────────────────────────────────────────
  "launchdarkly-node-server-sdk": "launchdarkly",
  "@launchdarkly/node-server-sdk": "launchdarkly",
  "flagsmith": "flagsmith",
  "unleash-client": "unleash",
  "@devcycle/nodejs-server-sdk": "devcycle",
  "statsig-node": "statsig",
  "statsig-js": "statsig",
  "flagpost": "flagpost",

  // ── Secrets Management ────────────────────────────────────────────
  "@doppler/sdk": "doppler",
  "infisical-node": "infisical",
  "@infisical/sdk": "infisical",
  "@aws-sdk/client-secrets-manager": "aws-secrets-manager",
  "vaultbox": "lockbox",

  // ── Rate Limiting ─────────────────────────────────────────────────
  "ratelimit-next": "floodgate",

  // ── Scheduled Tasks ───────────────────────────────────────────────
  "croncall": "clocktower",

  // ── Search ────────────────────────────────────────────────────────
  "searchcraft": "sifter",

  // ── Notifications ─────────────────────────────────────────────────
  "notifykit": "herald",

  // ── Image Processing ──────────────────────────────────────────────
  "shutterbox": "darkroom",

  // ── Content Collections ───────────────────────────────────────────
  "pressroom": "pressroom",

  // ── LLM Observability ─────────────────────────────────────────────
  "langfuse": "langfuse",
  "braintrust": "braintrust",
  "helicone": "helicone",
  "langsmith": "langsmith",
  "arize-phoenix": "arize-phoenix",

  // ── Incident Management ───────────────────────────────────────────
  "node-pagerduty": "pagerduty",
  "@pagerduty/pdjs": "pagerduty",

  // ── Security Scanning ─────────────────────────────────────────────
  "snyk": "snyk",
  "@snyk/protect": "snyk",

  // ── Edge Compute ──────────────────────────────────────────────────
  "wrangler": "cloudflare-workers",
  "@cloudflare/workers-types": "cloudflare-workers",
  "miniflare": "cloudflare-workers",
  "@deno/deploy": "deno-deploy",
  "flyctl": "fly-io",
  "@flydotio/dockerfile": "fly-io",
};

export const AGENTIC_PRODUCT_SUITE_PACKAGES: Record<string, string> = {
  flagpost: "flagpost",
  floodgate: "ratelimit-next",
  lockbox: "vaultbox",
  clocktower: "croncall",
  sifter: "searchcraft",
  herald: "notifykit",
  darkroom: "shutterbox",
  pressroom: "pressroom",
};

export const AGENTIC_PRODUCT_SUITE_VENDOR_IDS = Object.keys(
  AGENTIC_PRODUCT_SUITE_PACKAGES,
);

/**
 * Given a package name from an install command, return the vendor canonical ID.
 * Returns null if no mapping exists.
 */
export function resolvePackageToVendor(packageName: string): string | null {
  // Strip version specifiers: @supabase/supabase-js@2.0.0 → @supabase/supabase-js
  const cleaned = packageName.replace(/@[\d^~>=<.*]+$/, "");
  return PACKAGE_TO_VENDOR[cleaned] ?? null;
}

// ── Package Blocklist ────────────────────────────────────────────────
// Generic utility packages that aren't "vendors" — filtered out of unknown
// package collection to avoid noise.

const BLOCKLISTED_PACKAGES = new Set([
  // Core utilities
  "lodash", "underscore", "ramda", "uuid", "nanoid", "cuid",
  // Node built-in wrappers / polyfills
  "path", "fs-extra", "mkdirp", "rimraf", "glob", "minimatch",
  // HTTP / middleware
  "cors", "helmet", "compression", "cookie-parser", "body-parser",
  "express", "koa", "fastify", "hono",
  // Environment / config
  "dotenv", "cross-env", "env-cmd",
  // Formatting / linting
  "prettier", "eslint", "stylelint", "typescript",
  // Testing
  "jest", "mocha", "chai", "vitest", "supertest", "nock", "msw",
  // Build tools
  "webpack", "vite", "esbuild", "rollup", "tsup", "tsx", "ts-node",
  // Type utilities
  "zod", "yup", "joi", "ajv", "class-validator",
  // Misc
  "chalk", "commander", "yargs", "inquirer", "ora", "debug",
  "dayjs", "moment", "date-fns", "luxon",
  "axios", "node-fetch", "got", "ky",
  "sharp", "jimp",
  "pg", "mysql2", "sqlite3", "better-sqlite3", "mongodb", "mongoose", "redis", "ioredis",
  "next", "react", "react-dom", "vue", "svelte", "angular",
  "tailwindcss", "postcss", "autoprefixer", "sass", "less",
  "concurrently", "nodemon", "pm2",
  // Type definitions
  "@types/node", "@types/react", "@types/express",
]);

/**
 * Returns true if the package is a generic utility that should NOT be
 * treated as a vendor for discovery purposes.
 */
export function isBlocklistedPackage(packageName: string): boolean {
  const cleaned = packageName.replace(/@[\d^~>=<.*]+$/, "");
  if (BLOCKLISTED_PACKAGES.has(cleaned)) return true;
  // All @types/* packages are blocklisted
  if (cleaned.startsWith("@types/")) return true;
  return false;
}

/**
 * Derive a vendor identity from a package name for auto-discovered vendors.
 *
 * - `@org/package` → canonical_id: `pkg/org`, display_name: `org`
 * - `prisma` → canonical_id: `pkg/prisma`, display_name: `prisma`
 */
export function deriveVendorFromPackageName(packageName: string): {
  canonicalId: string;
  displayName: string;
  synonyms: string[];
} {
  const cleaned = packageName.replace(/@[\d^~>=<.*]+$/, "");

  if (cleaned.startsWith("@")) {
    // Scoped package: @org/package → use org as vendor
    const parts = cleaned.slice(1).split("/");
    const org = parts[0];
    return {
      canonicalId: `pkg/${org}`,
      displayName: org,
      synonyms: generatePackageSynonyms(org, cleaned),
    };
  }

  return {
    canonicalId: `pkg/${cleaned}`,
    displayName: cleaned,
    synonyms: generatePackageSynonyms(cleaned, cleaned),
  };
}

/**
 * Generate synonyms for a package-derived vendor.
 */
function generatePackageSynonyms(name: string, fullPackageName: string): string[] {
  const synonyms = new Set<string>();
  const lower = name.toLowerCase();

  synonyms.add(lower);
  synonyms.add(lower.replace(/-/g, " "));
  synonyms.add(lower.replace(/-/g, ""));

  // Add full scoped package name as synonym
  if (fullPackageName !== name) {
    synonyms.add(fullPackageName.toLowerCase());
  }

  return [...synonyms];
}
