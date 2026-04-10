import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import {
  fetchVendorStats,
  fetchVendorWinRate,
  fetchBenchmarkComparison,
  fetchHeadToHead,
  fetchSearch,
  fetchVendorFactors,
  fetchAllVendorStats,
} from "./client.js";

// ── Server ──────────────────────────────────────────────────────────

const server = new McpServer({
  name: "vendor-observatory",
  version: "0.1.0",
});

// ── Formatting helpers ──────────────────────────────────────────────

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function padR(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function padL(s: string, len: number): string {
  return s.length >= len ? s : " ".repeat(len - s.length) + s;
}

function bar(score: number, _max: number = 5): string {
  const filled = Math.round((score / _max) * 12);
  return "\u2588".repeat(filled) + "\u2591".repeat(12 - filled);
}

function separator(len: number = 40): string {
  return "\u2500".repeat(len);
}

// ── T1: observatory_vendor_stats ────────────────────────────────────

server.registerTool(
  "observatory_vendor_stats",
  {
    description:
      "Get mention statistics and win rate for a specific vendor across AI coding assistants (Claude Code, Codex CLI, Cursor). Returns install counts, recommendation counts, rejection counts, platform breakdown, and benchmark win rate.",
    inputSchema: z.object({
      vendor: z.string().describe("Vendor canonical ID (e.g. 'supabase', 'neon', 'sentry', 'stripe')"),
      platform: z
        .string()
        .optional()
        .describe("Filter by AI assistant platform: 'claude_code', 'codex_cli', or 'cursor'"),
    }),
  },
  async ({ vendor, platform }) => {
    try {
      const [stats, winRate] = await Promise.all([
        fetchVendorStats(vendor, platform),
        fetchVendorWinRate(vendor, platform).catch(() => null),
      ]);

      if (!stats || stats.length === 0) {
        return { content: [{ type: "text" as const, text: `No data found for vendor '${vendor}'.` }] };
      }

      // Aggregate across categories
      let total = 0, installed = 0, configured = 0, implemented = 0;
      let recommended = 0, compared = 0, mentioned = 0, rejected = 0;
      const platforms = new Set<string>();
      const categories = new Set<string>();

      for (const row of stats) {
        total += Number(row.total);
        installed += Number(row.installed);
        configured += Number(row.configured);
        implemented += Number(row.implemented);
        recommended += Number(row.recommended);
        compared += Number(row.compared);
        mentioned += Number(row.mentioned);
        rejected += Number(row.rejected);
        if (row.platforms) row.platforms.split(",").forEach((p) => platforms.add(p.trim()));
        if (row.work_category) categories.add(row.work_category);
      }

      const lines = [
        `${vendor} \u2014 Vendor Stats`,
        separator(30),
        `Total mentions: ${total}`,
        `  installed: ${installed}  configured: ${configured}  recommended: ${recommended}`,
        `  compared: ${compared}   mentioned: ${mentioned}   rejected: ${rejected}`,
        `  implemented: ${implemented}`,
      ];

      if (winRate) {
        lines.push(
          `Win rate: ${pct(winRate.wins, winRate.total)} (${winRate.wins}/${winRate.total} benchmark scenarios)`,
        );
      }

      if (platforms.size > 0) lines.push(`Platforms: ${[...platforms].join(", ")}`);
      if (categories.size > 0) lines.push(`Categories: ${[...categories].join(", ")}`);

      if (winRate?.breakdown && winRate.breakdown.length > 0) {
        lines.push("", "Win rate breakdown:");
        for (const b of winRate.breakdown.slice(0, 10)) {
          lines.push(`  ${padR(b.dimension, 10)} ${padR(b.value, 20)} ${pct(b.wins, b.total)} (${b.wins}/${b.total})`);
        }
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
);

// ── T2: observatory_benchmark ───────────────────────────────────────

server.registerTool(
  "observatory_benchmark",
  {
    description:
      "Get benchmark leaderboard showing which vendors AI coding assistants recommend most frequently. Filterable by category (e.g. 'database', 'observability') and platform.",
    inputSchema: z.object({
      category: z
        .string()
        .optional()
        .describe("Filter by category (e.g. 'database', 'observability', 'rate_limiting', 'feature_flags')"),
      platform: z
        .string()
        .optional()
        .describe("Filter by platform: 'claude_code', 'codex_cli', or 'cursor'"),
      limit: z
        .number()
        .optional()
        .describe("Max vendors to return (default 10)"),
    }),
  },
  async ({ category, platform, limit }) => {
    try {
      const maxResults = limit ?? 10;
      const comparison = await fetchBenchmarkComparison(category, platform);

      if (!comparison || comparison.length === 0) {
        return { content: [{ type: "text" as const, text: `No benchmark data found${category ? ` for category '${category}'` : ""}.` }] };
      }

      const sorted = [...comparison].sort((a, b) => Number(b.total) - Number(a.total)).slice(0, maxResults);

      const title = category
        ? `Benchmark Leaderboard \u2014 ${category}`
        : "Benchmark Leaderboard \u2014 All Categories";

      const lines = [title, separator(50)];
      lines.push(` #  ${padR("Vendor", 20)} ${padL("Claude", 7)} ${padL("Codex", 7)} ${padL("Cursor", 7)} ${padL("Total", 7)}`);

      let grandTotal = 0;
      for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i];
        grandTotal += Number(r.total);
        lines.push(
          `${padL(String(i + 1), 2)}  ${padR(r.vendor_canonical_id, 20)} ${padL(String(r.claude_code_count ?? 0), 7)} ${padL(String(r.codex_cli_count ?? 0), 7)} ${padL(String(r.cursor_count ?? 0), 7)} ${padL(String(r.total), 7)}`,
        );
      }

      lines.push("", `Total benchmark observations: ${grandTotal}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
);

// ── T3: observatory_factors ─────────────────────────────────────────

server.registerTool(
  "observatory_factors",
  {
    description:
      "Get the 13-factor scorecard for a vendor, showing scores for ecosystem position, integration speed, sentiment, training data, serverless compat, MCP integration, and more. Includes category averages and improvement priorities.",
    inputSchema: z.object({
      vendor: z.string().describe("Vendor canonical ID (e.g. 'neon', 'supabase', 'sentry')"),
    }),
  },
  async ({ vendor }) => {
    try {
      const data = await fetchVendorFactors(vendor);

      if (!data.vendor) {
        return { content: [{ type: "text" as const, text: `No factor data found for vendor '${vendor}'.` }] };
      }

      const { vendor: v, factors, categoryAvg, categoryBest, improvements } = data;

      const lines = [
        `${v.vendorId} \u2014 13-Factor Scorecard`,
        separator(60),
        `${padR("Factor", 32)} ${padL("Score", 5)} ${padL("CatAvg", 7)} ${padL("CatBest", 8)} ${padL("Gap", 5)}  Visual`,
      ];

      for (const f of factors) {
        const score = v.scores[f.id];
        if (score == null) {
          lines.push(`${padR(f.label, 32)} ${padL("-", 5)} ${padL("-", 7)} ${padL("-", 8)} ${padL("-", 5)}`);
          continue;
        }
        const catAvg = categoryAvg[f.id] ?? 0;
        const catBst = categoryBest[f.id] ?? 5;
        const gap = catBst - score;
        const marker = score <= 2 ? "  \u2190 improve" : gap >= 2 ? "  \u2190 improve" : "";

        lines.push(
          `${padR(f.label, 32)} ${padL(String(score), 5)} ${padL(catAvg.toFixed(1), 7)} ${padL(String(catBst), 8)} ${padL(String(-gap), 5)}  ${bar(score)}${marker}`,
        );
      }

      lines.push("", `Composite: ${v.compositeScore.toFixed(2)} / 5.00 (${v.factorCount} factors scored, confidence: ${v.confidence})`);

      if (improvements.length > 0) {
        lines.push("", "Priority improvements:");
        for (const imp of improvements.slice(0, 5)) {
          lines.push(`  [${imp.priority}] ${imp.title} (score ${imp.score}, gap ${imp.gap})`);
          lines.push(`    ${imp.description.slice(0, 120)}...`);
        }
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
);

// ── T4: observatory_compare ─────────────────────────────────────────

server.registerTool(
  "observatory_compare",
  {
    description:
      "Head-to-head comparison of two vendors across benchmark scenarios. Shows which vendor wins more often, in which scenarios, and with what rationale.",
    inputSchema: z.object({
      vendor_a: z.string().describe("First vendor canonical ID (e.g. 'resend')"),
      vendor_b: z.string().describe("Second vendor canonical ID (e.g. 'sendgrid')"),
      platform: z
        .string()
        .optional()
        .describe("Filter by platform: 'claude_code', 'codex_cli', or 'cursor'"),
    }),
  },
  async ({ vendor_a, vendor_b, platform }) => {
    try {
      const h2h = await fetchHeadToHead(vendor_a, vendor_b, platform);

      const totalScenarios = h2h.aWins + h2h.bWins + h2h.ties;
      if (totalScenarios === 0) {
        return { content: [{ type: "text" as const, text: `No head-to-head data found for ${vendor_a} vs ${vendor_b}.` }] };
      }

      const lines = [
        `Head-to-Head: ${vendor_a} vs ${vendor_b}`,
        separator(40),
        `${padR(vendor_a + " wins:", 22)} ${h2h.aWins} scenarios`,
        `${padR(vendor_b + " wins:", 22)} ${h2h.bWins} scenarios`,
        `${padR("ties:", 22)} ${h2h.ties} scenarios`,
        "",
        `Win rate: ${vendor_a} ${pct(h2h.aWins, totalScenarios)} vs ${vendor_b} ${pct(h2h.bWins, totalScenarios)} (${pct(h2h.ties, totalScenarios)} ties)`,
      ];

      if (h2h.scenarios && h2h.scenarios.length > 0) {
        lines.push("", "Scenario details:");
        for (const s of h2h.scenarios.slice(0, 10)) {
          const winner = s.winner ?? "tie";
          const rationale = s.rationale ? ` \u2014 ${s.rationale.slice(0, 100)}` : "";
          lines.push(`  [${s.category}] ${s.prompt_id}: ${winner}${rationale}`);
        }
        if (h2h.scenarios.length > 10) {
          lines.push(`  ... and ${h2h.scenarios.length - 10} more scenarios`);
        }
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
);

// ── T5: observatory_search ──────────────────────────────────────────

server.registerTool(
  "observatory_search",
  {
    description:
      "Full-text search across AI coding assistant transcripts. Finds rationales, trade-offs, and gotchas that assistants mention about vendors. Useful for understanding *why* tools get recommended or rejected.",
    inputSchema: z.object({
      query: z.string().describe("Search query (e.g. 'prisma drizzle trade-offs', 'serverless database cold start')"),
      vendor: z.string().optional().describe("Filter results to a specific vendor"),
      category: z.string().optional().describe("Filter by category (e.g. 'database')"),
      limit: z.number().optional().describe("Max results to return (default 10, max 50)"),
    }),
  },
  async ({ query, vendor, category, limit }) => {
    try {
      const maxResults = Math.min(limit ?? 10, 50);
      const results = await fetchSearch(query, vendor, category, String(maxResults));

      if (!results || results.length === 0) {
        return { content: [{ type: "text" as const, text: `No results found for "${query}".` }] };
      }

      const lines = [`Search: "${query}" (${results.length} results)`, separator(50)];

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        lines.push(
          `${i + 1}. [${r.category}] ${r.platform} \u2014 prompt ${r.prompt_id}`,
          `   ${r.snippet.replace(/<\/?[^>]+(>|$)/g, "").slice(0, 200)}`,
          "",
        );
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
);

// ── T6: observatory_overview ────────────────────────────────────────

server.registerTool(
  "observatory_overview",
  {
    description:
      "Get a high-level summary of the Vendor Observatory data: total sessions, observations, unique vendors, platform breakdown, and the top vendors by mention count.",
    inputSchema: z.object({
      platform: z.string().optional().describe("Filter by platform: 'claude_code', 'codex_cli', or 'cursor'"),
    }),
  },
  async ({ platform }) => {
    try {
      const allStats = await fetchAllVendorStats(platform);

      if (!allStats || allStats.length === 0) {
        return { content: [{ type: "text" as const, text: "No observatory data available." }] };
      }

      const vendorTotals = new Map<string, number>();
      let totalObs = 0;
      const platformCounts = new Map<string, number>();

      for (const row of allStats) {
        const t = Number(row.total);
        totalObs += t;
        vendorTotals.set(row.vendor_canonical_id, (vendorTotals.get(row.vendor_canonical_id) ?? 0) + t);
        if (row.platforms) {
          for (const p of row.platforms.split(",")) {
            const pt = p.trim();
            if (pt) platformCounts.set(pt, (platformCounts.get(pt) ?? 0) + t);
          }
        }
      }

      const sortedVendors = [...vendorTotals.entries()].sort((a, b) => b[1] - a[1]);
      const platformStr = [...platformCounts.entries()].map(([p, c]) => `${p}: ${c}`).join(", ");

      const lines = [
        "Vendor Observatory \u2014 Overview",
        separator(35),
        `Observations:  ${totalObs}`,
        `Unique vendors: ${vendorTotals.size}`,
        `Platforms: ${platformStr || "N/A"}`,
        "",
        "Top vendors by mention count:",
      ];

      const top = sortedVendors.slice(0, 10);
      for (let i = 0; i < top.length; i += 2) {
        const left = `${padL(String(i + 1), 2)}. ${padR(top[i][0], 16)} (${top[i][1]})`;
        if (i + 1 < top.length) {
          const right = `${padL(String(i + 2), 2)}. ${padR(top[i + 1][0], 16)} (${top[i + 1][1]})`;
          lines.push(`${padR(left, 35)} ${right}`);
        } else {
          lines.push(left);
        }
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }] };
    }
  },
);

// ── Export ───────────────────────────────────────────────────────────

export { server };
