/**
 * Pre-flight validation for Supabase Edge Functions.
 *
 * Checks the TypeScript/Deno source for common deployment pitfalls
 * before the function is deployed.
 */

import type {
  EdgeFunctionCheckInput,
  PreflightResult,
  Diagnostic,
  PreflightPlugin,
} from "./types.js";

type CheckFn = (input: EdgeFunctionCheckInput) => Diagnostic[];

const checks: CheckFn[] = [
  checkDenoServe,
  checkCorsHeaders,
  checkJwtDisabled,
  checkHardcodedSecrets,
  checkResponseHeaders,
  checkImportPatterns,
  checkErrorHandling,
  checkRequestParsing,
];

export function checkEdgeFunction(
  input: EdgeFunctionCheckInput,
  plugins: PreflightPlugin[] = [],
): PreflightResult {
  const start = performance.now();
  const diagnostics: Diagnostic[] = [];

  for (const check of checks) {
    diagnostics.push(...check(input));
  }

  for (const plugin of plugins) {
    if (plugin.checker === "edge-function") {
      diagnostics.push(...plugin.analyze(input));
    }
  }

  const durationMs = Math.round(performance.now() - start);
  const hasErrors = diagnostics.some((d) => d.severity === "error");

  return {
    ok: !hasErrors,
    diagnostics,
    durationMs,
    checker: "edge-function",
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Check implementations
// ---------------------------------------------------------------------------

function checkDenoServe(input: EdgeFunctionCheckInput): Diagnostic[] {
  const { source } = input;
  const results: Diagnostic[] = [];

  if (!/Deno\.serve/i.test(source)) {
    results.push({
      code: "MISSING_DENO_SERVE",
      severity: "error",
      message:
        "Edge function does not call Deno.serve() — it won't handle any requests.",
      suggestion:
        'Add Deno.serve(async (req) => { return new Response("ok"); });',
      docsUrl:
        "https://supabase.com/docs/guides/functions/quickstart",
    });
  }

  // Check for the old serve() import pattern (deprecated)
  if (/import\s+.*\bserve\b.*from\s+["']https:\/\/deno\.land/i.test(source)) {
    results.push({
      code: "DEPRECATED_SERVE_IMPORT",
      severity: "warning",
      message:
        "Importing serve() from deno.land is deprecated. Use Deno.serve() directly.",
      suggestion:
        "Remove the import and replace serve() calls with Deno.serve().",
      docsUrl:
        "https://supabase.com/docs/guides/functions/quickstart",
    });
  }

  return results;
}

function checkCorsHeaders(input: EdgeFunctionCheckInput): Diagnostic[] {
  const { source } = input;
  const results: Diagnostic[] = [];

  // Check if function handles OPTIONS requests (CORS preflight)
  const handlesOptions =
    /req\.method\s*===?\s*["']OPTIONS["']/i.test(source) ||
    /method\s*===?\s*["']OPTIONS["']/i.test(source);

  const hasCorsHeaders =
    /Access-Control-Allow-Origin/i.test(source) ||
    /cors/i.test(source);

  if (!handlesOptions && !hasCorsHeaders) {
    results.push({
      code: "MISSING_CORS",
      severity: "warning",
      message:
        "No CORS handling detected. Browser requests from your frontend will fail.",
      suggestion:
        'Handle OPTIONS requests and include Access-Control-Allow-Origin headers. See Supabase CORS guide.',
      docsUrl:
        "https://supabase.com/docs/guides/functions/cors",
    });
  }

  return results;
}

function checkJwtDisabled(input: EdgeFunctionCheckInput): Diagnostic[] {
  const results: Diagnostic[] = [];

  if (!input.verifyJwt) {
    // Check if the function implements its own auth
    const hasCustomAuth =
      /authorization/i.test(input.source) ||
      /api[_-]?key/i.test(input.source) ||
      /bearer/i.test(input.source) ||
      /webhook/i.test(input.source);

    if (!hasCustomAuth) {
      results.push({
        code: "JWT_DISABLED_NO_AUTH",
        severity: "error",
        message:
          "JWT verification is disabled and no custom authentication detected. This function is publicly accessible.",
        suggestion:
          "Either enable JWT verification (verify_jwt: true) or implement custom authentication (API keys, webhook signatures, etc.).",
        docsUrl:
          "https://supabase.com/docs/guides/functions/auth",
      });
    } else {
      results.push({
        code: "JWT_DISABLED_CUSTOM_AUTH",
        severity: "info",
        message:
          "JWT verification is disabled but custom auth logic is detected.",
        suggestion:
          "Verify your custom authentication is correctly implemented and tested.",
      });
    }
  }
  return results;
}

function checkHardcodedSecrets(input: EdgeFunctionCheckInput): Diagnostic[] {
  const { source } = input;
  const results: Diagnostic[] = [];

  // Check for hardcoded API keys, passwords, secrets
  const secretPatterns = [
    {
      pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][a-zA-Z0-9_-]{20,}["']/gi,
      type: "API key",
    },
    {
      pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']+["']/gi,
      type: "password",
    },
    {
      pattern: /(?:secret|token)\s*[:=]\s*["'][a-zA-Z0-9_-]{20,}["']/gi,
      type: "secret/token",
    },
    {
      pattern: /sk_(?:live|test)_[a-zA-Z0-9]{20,}/g,
      type: "Stripe secret key",
    },
    {
      pattern: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\./g,
      type: "JWT token",
    },
  ];

  for (const { pattern, type } of secretPatterns) {
    if (pattern.test(source)) {
      results.push({
        code: "HARDCODED_SECRET",
        severity: "error",
        message: `Possible hardcoded ${type} detected in edge function source.`,
        suggestion: `Use Deno.env.get("SECRET_NAME") instead. Set secrets with: supabase secrets set SECRET_NAME=value`,
        docsUrl:
          "https://supabase.com/docs/guides/functions/secrets",
      });
    }
  }
  return results;
}

function checkResponseHeaders(input: EdgeFunctionCheckInput): Diagnostic[] {
  const { source } = input;
  const results: Diagnostic[] = [];

  // Check if JSON responses have Content-Type header
  const hasJsonStringify = /JSON\.stringify/i.test(source);
  const hasContentType = /Content-Type/i.test(source);

  if (hasJsonStringify && !hasContentType) {
    results.push({
      code: "MISSING_CONTENT_TYPE",
      severity: "warning",
      message:
        "Response uses JSON.stringify() but doesn't set Content-Type header.",
      suggestion:
        "Add headers: { 'Content-Type': 'application/json' } to your Response.",
    });
  }

  // Check for Connection: keep-alive (recommended)
  if (!/Connection/i.test(source)) {
    results.push({
      code: "MISSING_KEEP_ALIVE",
      severity: "info",
      message:
        "Response doesn't include Connection: keep-alive header.",
      suggestion:
        "Add 'Connection': 'keep-alive' header for better performance.",
    });
  }

  return results;
}

function checkImportPatterns(input: EdgeFunctionCheckInput): Diagnostic[] {
  const { source } = input;
  const results: Diagnostic[] = [];

  // Check for npm: imports without a deno.json import map
  if (/from\s+["']npm:/i.test(source)) {
    const hasDenoJson = input.additionalFiles?.some(
      (f) => f.name === "deno.json" || f.name === "deno.jsonc",
    );
    if (!hasDenoJson) {
      results.push({
        code: "NPM_IMPORT_NO_DENO_JSON",
        severity: "info",
        message:
          "Using npm: imports without a deno.json. This works but a deno.json allows version pinning.",
        suggestion:
          "Consider adding a deno.json with an imports map for reproducible builds.",
      });
    }
  }

  // Check for the recommended JSR import for Supabase types
  if (
    /Deno\.serve/i.test(source) &&
    !/jsr:@supabase\/functions-js/i.test(source) &&
    !/edge-runtime\.d\.ts/i.test(source)
  ) {
    results.push({
      code: "MISSING_TYPE_IMPORT",
      severity: "info",
      message:
        "Missing Supabase Edge Runtime type import. Types improve IDE support.",
      suggestion:
        'Add: import "jsr:@supabase/functions-js/edge-runtime.d.ts";',
    });
  }

  return results;
}

function checkErrorHandling(input: EdgeFunctionCheckInput): Diagnostic[] {
  const { source } = input;
  const results: Diagnostic[] = [];

  if (!/try\s*\{/i.test(source) && !/\.catch\s*\(/i.test(source)) {
    results.push({
      code: "NO_ERROR_HANDLING",
      severity: "warning",
      message:
        "No try/catch or .catch() detected. Unhandled errors will return a 500 with no useful message.",
      suggestion:
        "Wrap your handler logic in try/catch and return a structured error response.",
    });
  }

  return results;
}

function checkRequestParsing(input: EdgeFunctionCheckInput): Diagnostic[] {
  const { source } = input;
  const results: Diagnostic[] = [];

  // Check for req.json() without checking content-type or method
  if (/req\.json\(\)/i.test(source)) {
    if (!/req\.method/i.test(source) && !/method/i.test(source)) {
      results.push({
        code: "JSON_PARSE_WITHOUT_METHOD_CHECK",
        severity: "warning",
        message:
          "Calling req.json() without checking the request method. GET requests with req.json() will throw.",
        suggestion:
          'Check req.method before parsing: if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });',
      });
    }
  }

  return results;
}
