import { describe, it, expect } from "vitest";
import { checkEdgeFunction } from "./check-edge-function.js";
import type { EdgeFunctionCheckInput } from "./types.js";

function check(source: string, extra?: Partial<EdgeFunctionCheckInput>) {
  return checkEdgeFunction({
    source,
    name: extra?.name ?? "test-fn",
    verifyJwt: extra?.verifyJwt ?? true,
    additionalFiles: extra?.additionalFiles,
  });
}

describe("checkEdgeFunction", () => {
  const validFn = `
    import "jsr:@supabase/functions-js/edge-runtime.d.ts";

    Deno.serve(async (req: Request) => {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "authorization, content-type",
          },
        });
      }

      try {
        const data = await req.json();
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
            "Connection": "keep-alive",
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });
  `;

  it("passes a well-formed edge function", () => {
    const result = check(validFn);
    expect(result.ok).toBe(true);
    expect(result.checker).toBe("edge-function");
  });

  it("flags missing Deno.serve", () => {
    const result = check('export default function() { return "hi"; }');
    const diag = result.diagnostics.find(
      (d) => d.code === "MISSING_DENO_SERVE",
    );
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("error");
  });

  it("flags deprecated serve() import", () => {
    const result = check(`
      import { serve } from "https://deno.land/std/http/server.ts";
      serve(() => new Response("ok"));
    `);
    const diag = result.diagnostics.find(
      (d) => d.code === "DEPRECATED_SERVE_IMPORT",
    );
    expect(diag).toBeDefined();
  });

  it("flags missing CORS handling", () => {
    const result = check(`
      Deno.serve(() => new Response("ok"));
    `);
    const diag = result.diagnostics.find((d) => d.code === "MISSING_CORS");
    expect(diag).toBeDefined();
  });

  it("flags JWT disabled with no custom auth", () => {
    const result = check(
      'Deno.serve(() => new Response("public"));',
      { verifyJwt: false },
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "JWT_DISABLED_NO_AUTH",
    );
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("error");
  });

  it("allows JWT disabled with custom auth", () => {
    const result = check(
      `Deno.serve(async (req) => {
        const apiKey = req.headers.get("authorization");
        return new Response("ok");
      });`,
      { verifyJwt: false },
    );
    const diag = result.diagnostics.find(
      (d) => d.code === "JWT_DISABLED_NO_AUTH",
    );
    expect(diag).toBeUndefined();
    const info = result.diagnostics.find(
      (d) => d.code === "JWT_DISABLED_CUSTOM_AUTH",
    );
    expect(info).toBeDefined();
  });

  it("flags hardcoded secrets", () => {
    const result = check(`
      Deno.serve(() => {
        const apiKey = "sk_live_1234567890abcdefghijklmn";
        return new Response("ok");
      });
    `);
    const diag = result.diagnostics.find(
      (d) => d.code === "HARDCODED_SECRET",
    );
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("error");
  });

  it("flags missing Content-Type with JSON.stringify", () => {
    const result = check(`
      Deno.serve(() => {
        return new Response(JSON.stringify({ ok: true }));
      });
    `);
    const diag = result.diagnostics.find(
      (d) => d.code === "MISSING_CONTENT_TYPE",
    );
    expect(diag).toBeDefined();
  });

  it("flags req.json() without method check", () => {
    const result = check(`
      Deno.serve(async (req) => {
        const body = await req.json();
        return new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        });
      });
    `);
    const diag = result.diagnostics.find(
      (d) => d.code === "JSON_PARSE_WITHOUT_METHOD_CHECK",
    );
    expect(diag).toBeDefined();
  });

  it("flags no error handling", () => {
    const result = check(`
      Deno.serve(async (req) => {
        const body = await req.json();
        return new Response(JSON.stringify(body));
      });
    `);
    const diag = result.diagnostics.find(
      (d) => d.code === "NO_ERROR_HANDLING",
    );
    expect(diag).toBeDefined();
  });
});
