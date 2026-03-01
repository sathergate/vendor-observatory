import { Pool } from "pg";
import { loadPromptById } from "@obs/shared";

/**
 * Fallback URL analysis when the Next.js API didn't complete it.
 * Uses Claude Haiku for extraction, same as the web URL analyzer.
 */
export async function runUrlAnalysisFallback(
  jobId: string,
  url: string,
  domain: string,
  pool: Pool,
): Promise<void> {
  try {
    const pageContent = await fetchPageContent(url);
    const analysis = await extractWithLLM(pageContent, domain, pool);

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
    // On failure, use domain name as fallback
    const fallbackName = domain.split(".")[0];
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
    console.error(`[url-analysis-fallback] Failed for job ${jobId}:`, err);
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

    if (!res.ok) return `Failed to fetch: HTTP ${res.status}`;

    const html = await res.text();
    return extractVisibleText(html);
  } finally {
    clearTimeout(timeout);
  }
}

function extractVisibleText(html: string): string {
  const parts: string[] = [];

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) parts.push(`Title: ${titleMatch[1].trim()}`);

  const metaMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i)
    ?? html.match(/<meta\s+content=["']([\s\S]*?)["']\s+name=["']description["']/i);
  if (metaMatch) parts.push(`Description: ${metaMatch[1].trim()}`);

  const h1Matches = html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  for (const m of h1Matches) {
    const text = m[1].replace(/<[^>]+>/g, "").trim();
    if (text) parts.push(`H1: ${text}`);
  }

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

interface UrlAnalysisResult {
  product_name: string;
  category: string;
  description: string;
  competitors: Array<{ name: string; domain: string }>;
}

const URL_ANALYSIS_PROMPT_FALLBACK = `Given this homepage content for {{DOMAIN}}, extract structured product information.

<page_content>
{{PAGE_CONTENT}}
</page_content>

Return a JSON object with exactly these fields:
- product_name: the canonical name of the product (string)
- category: one of {{VALID_CATEGORIES}} (string)
- description: one sentence describing what the product does (string)
- competitors: top 5 direct competitors as an array of {name: string, domain: string}

Return ONLY valid JSON, no markdown or explanation.`;

let _cachedUrlAnalysisTemplate: string | null = null;

async function getUrlAnalysisTemplate(pool: Pool): Promise<string> {
  if (_cachedUrlAnalysisTemplate) return _cachedUrlAnalysisTemplate;

  const row = await loadPromptById(pool, "system-url-analysis");
  if (row) {
    _cachedUrlAnalysisTemplate = row.text;
    return row.text;
  }

  return URL_ANALYSIS_PROMPT_FALLBACK;
}

async function extractWithLLM(
  pageContent: string,
  domain: string,
  pool: Pool,
): Promise<UrlAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const name = domain.split(".")[0];
    return {
      product_name: name.charAt(0).toUpperCase() + name.slice(1),
      category: "other",
      description: "",
      competitors: [],
    };
  }

  const template = await getUrlAnalysisTemplate(pool);
  const prompt = template
    .replace("{{DOMAIN}}", domain)
    .replace("{{PAGE_CONTENT}}", pageContent.slice(0, 3000))
    .replace("{{VALID_CATEGORIES}}", JSON.stringify(VALID_CATEGORIES));

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
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.[0]?.text ?? "";
  const jsonStr = text.replace(/^```json?\s*/, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(jsonStr) as UrlAnalysisResult;

  if (!VALID_CATEGORIES.includes(parsed.category)) {
    parsed.category = "other";
  }

  return parsed;
}
