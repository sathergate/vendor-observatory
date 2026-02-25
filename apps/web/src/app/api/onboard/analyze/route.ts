import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createJob, findRecentJob } from "@/lib/onboard";
import { runUrlAnalysis } from "@/lib/url-analyzer";

let _pool: Pool | null = null;
function getPool(): Pool | null {
  if (_pool) return _pool;
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;
  _pool = new Pool({ connectionString: cs });
  return _pool;
}

export async function POST(request: Request) {
  let { url } = await request.json();

  // Normalize: prepend https:// if no protocol provided
  if (url && !url.match(/^https?:\/\//i)) {
    url = `https://${url}`;
  }

  // Validate and extract domain
  let domain: string;
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Rate limit: reuse report if domain was analyzed in the last 24h
  const existing = await findRecentJob(domain);
  if (existing) return NextResponse.json({ jobId: existing });

  const jobId = await createJob(url, domain);

  // Fire URL analysis as a background task (don't await — let the response return immediately).
  // The worker on Fly.io will pick up fast + balanced benchmarks from the DB.
  const pool = getPool();
  if (pool && process.env.USE_REAL_BENCHMARK === "true") {
    runUrlAnalysis(jobId, pool).catch((err) => {
      console.error("[analyze] Background URL analysis failed:", err);
    });
  }

  return NextResponse.json({ jobId });
}
