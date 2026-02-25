import { Pool } from "pg";

interface UrlAnalysisResult {
  product_name: string;
  category: string;
  description: string;
  competitors: Array<{ name: string; domain: string }>;
}

/**
 * Fetch a URL and extract product information using Claude Haiku.
 * Designed to run in ~5-10s — well within Vercel's 30s function timeout.
 */
export async function runUrlAnalysis(jobId: string, pool: Pool): Promise<void> {
  // Load the job
  const { rows } = await pool.query(
    "SELECT id, url, domain FROM onboarding_jobs WHERE id = $1",
    [jobId]
  );
  if (rows.length === 0) return;
  const job = rows[0];

  try {
    // 1. Fetch the URL with a 5s timeout
    const pageContent = await fetchPageContent(job.url);

    // 2. Call Claude Haiku for structured extraction
    const analysis = await extractWithLLM(pageContent, job.domain);

    // 3. Write results to DB
    await pool.query(
      `UPDATE onboarding_jobs
       SET product_name = $1,
           detected_category = $2,
           competitors = $3,
           url_analysis_completed_at = NOW()
       WHERE id = $4`,
      [
        analysis.product_name,
        analysis.category,
        JSON.stringify(analysis.competitors),
        jobId,
      ]
    );
  } catch (err) {
    // On failure, still mark as completed with best-effort data from domain
    const fallbackName = job.domain.split(".")[0];
    const capitalized = fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1);
    await pool.query(
      `UPDATE onboarding_jobs
       SET product_name = $1,
           detected_category = 'other',
           competitors = '[]'::jsonb,
           url_analysis_completed_at = NOW()
       WHERE id = $2`,
      [capitalized, jobId]
    );
    console.error(`[url-analyzer] Failed for job ${jobId}:`, err);
  }
}

async function fetchPageContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "VendorObservatory/1.0 (benchmark bot)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return `Failed to fetch: HTTP ${res.status}`;
    }

    const html = await res.text();
    return extractVisibleText(html);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract visible text from HTML: title, meta description, h1, body text.
 */
function extractVisibleText(html: string): string {
  const parts: string[] = [];

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) parts.push(`Title: ${titleMatch[1].trim()}`);

  // Meta description
  const metaMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i)
    ?? html.match(/<meta\s+content=["']([\s\S]*?)["']\s+name=["']description["']/i);
  if (metaMatch) parts.push(`Description: ${metaMatch[1].trim()}`);

  // OG description
  const ogMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([\s\S]*?)["']/i);
  if (ogMatch) parts.push(`OG Description: ${ogMatch[1].trim()}`);

  // H1 tags
  const h1Matches = html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  for (const m of h1Matches) {
    const text = m[1].replace(/<[^>]+>/g, "").trim();
    if (text) parts.push(`H1: ${text}`);
  }

  // H2 tags (first 5)
  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].slice(0, 5);
  for (const m of h2Matches) {
    const text = m[1].replace(/<[^>]+>/g, "").trim();
    if (text) parts.push(`H2: ${text}`);
  }

  // Strip HTML tags and get first 1500 chars of body text
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    const bodyText = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500);
    parts.push(`Body: ${bodyText}`);
  }

  return parts.join("\n\n");
}

const VALID_CATEGORIES = [
  "database", "auth", "hosting", "ci_cd", "monitoring", "payments",
  "email", "storage", "search", "analytics", "ai_ml", "messaging",
  "cdn", "dns", "observability", "error_monitoring", "feature_flags",
  "secrets_management", "developer_portal", "llm_observability",
  "incident_management", "security_scanning", "edge_compute",
  "developer_tools", "testing", "cms", "ecommerce", "other",
];

async function extractWithLLM(
  pageContent: string,
  domain: string,
): Promise<UrlAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback without LLM
    const name = domain.split(".")[0];
    return {
      product_name: name.charAt(0).toUpperCase() + name.slice(1),
      category: "other",
      description: "",
      competitors: [],
    };
  }

  const prompt = `Given this homepage content for ${domain}, extract structured product information.

<page_content>
${pageContent.slice(0, 3000)}
</page_content>

Return a JSON object with exactly these fields:
- product_name: the canonical name of the product (string)
- category: one of ${JSON.stringify(VALID_CATEGORIES)} (string)
- description: one sentence describing what the product does (string)
- competitors: top 5 direct competitors as an array of {name: string, domain: string}

Return ONLY valid JSON, no markdown or explanation.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";

  // Parse JSON from response (handle possible markdown wrapping)
  const jsonStr = text.replace(/^```json?\s*/, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(jsonStr) as UrlAnalysisResult;

  // Validate category
  if (!VALID_CATEGORIES.includes(parsed.category)) {
    parsed.category = "other";
  }

  return parsed;
}
