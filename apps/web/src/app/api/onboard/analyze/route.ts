import { NextResponse } from "next/server";
import { createJob, findRecentJob, getPool } from "@/lib/onboard";
import { runUrlAnalysis } from "@/lib/url-analyzer";

export async function POST(request: Request) {
  let { url } = await request.json();

  // Normalize: prepend https:// if no protocol provided
  if (url && !url.match(/^https?:\/\//i)) {
    url = `https://${url}`;
  }

  // Validate and extract domain
  let domain: string;
  try {
    const parsedUrl = new URL(url);
    // Reject URLs with userinfo (e.g. "james@supabase.com" parsed as credentials)
    if (parsedUrl.username || parsedUrl.password) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    domain = parsedUrl.hostname.replace(/^www\./, "");
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Rate limit: reuse report if domain was analyzed in the last 24h
  const existing = await findRecentJob(domain);
  if (existing) return NextResponse.json({ jobId: existing });

  const jobId = await createJob(url, domain);

  // Reuse URL analysis from a previous completed job for the same domain
  // to ensure deterministic results across submissions
  const pool = getPool();
  if (pool) {
    try {
      const { rows: existingAnalysis } = await pool.query(
        `SELECT product_name, detected_category, competitors
         FROM onboarding_jobs
         WHERE domain = $1 AND url_analysis_completed_at IS NOT NULL
         ORDER BY url_analysis_completed_at DESC LIMIT 1`,
        [domain]
      );
      if (existingAnalysis.length > 0) {
        const prev = existingAnalysis[0];
        await pool.query(
          `UPDATE onboarding_jobs
           SET product_name = $1, detected_category = $2, competitors = $3, url_analysis_completed_at = NOW()
           WHERE id = $4`,
          [prev.product_name, prev.detected_category, JSON.stringify(prev.competitors), jobId]
        );
        return NextResponse.json({ jobId });
      }
    } catch (err) {
      console.error("[analyze] Failed to check existing analysis:", err);
    }

    // Fire URL analysis as a background task (don't await — let the response return immediately).
    // The worker on Fly.io will pick up fast + balanced benchmarks from the DB.
    runUrlAnalysis(jobId, pool).catch((err) => {
      console.error("[analyze] Background URL analysis failed:", err);
    });
  }

  return NextResponse.json({ jobId });
}
