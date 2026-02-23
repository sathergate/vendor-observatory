import { NextResponse } from "next/server";
import { createJob, findRecentJob } from "@/lib/onboard";

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

  // TODO: In production, dispatch 4 background analysis jobs here:
  // 1. URL analysis (<30s) — extracts product name, category, competitors
  // 2. Fast benchmark (30s)
  // 3. Balanced benchmark (2 min)
  // 4. Comprehensive benchmark (5 min)
  // For now, results are mocked based on elapsed time in GET /api/onboard/analyze/[jobId].

  const jobId = await createJob(url, domain);
  return NextResponse.json({ jobId });
}
