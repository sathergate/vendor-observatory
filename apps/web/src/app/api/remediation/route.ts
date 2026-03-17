import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/remediation?vendor_id=X&status=Y
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const vendorId = searchParams.get("vendor_id");
  const status = searchParams.get("status");

  // For now, return empty list (DB integration comes with migration)
  return NextResponse.json({
    issues: [],
    filters: { vendorId, status },
  });
}

// POST /api/remediation — create or generate issues
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === "generate") {
    // Generate issues from rejection clusters
    return NextResponse.json({ generated: 0, message: "Issue generation requires database connection" });
  }

  if (action === "create") {
    // Manual issue creation
    return NextResponse.json({ created: false, message: "Issue creation requires database connection" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// PATCH /api/remediation — update issue status
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { issueId, status, assignee, ownerTeam } = body;

  if (!issueId) {
    return NextResponse.json({ error: "issueId required" }, { status: 400 });
  }

  return NextResponse.json({ updated: false, message: "Status update requires database connection" });
}
