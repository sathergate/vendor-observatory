import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock onboard lib ─────────────────────────────────────────────────

const mockGetJobStatus = vi.fn();

vi.mock("@/lib/onboard", () => ({
  getJobStatus: (...args: unknown[]) => mockGetJobStatus(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/onboard/analyze/[jobId] ─────────────────────────────────

describe("GET /api/onboard/analyze/[jobId]", () => {
  async function callGet(jobId: string) {
    const { GET } = await import("./route");
    const req = new Request(`http://localhost/api/onboard/analyze/${jobId}`);
    return GET(req, { params: Promise.resolve({ jobId }) });
  }

  it("returns 404 when getJobStatus returns null", async () => {
    mockGetJobStatus.mockResolvedValue(null);

    const res = await callGet("nonexistent");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Not found");
  });

  it("returns 200 with full JobStatus shape when job exists", async () => {
    const mockStatus = {
      jobId: "job-1",
      url: "https://sentry.io",
      domain: "sentry.io",
      email: null,
      stages: {
        url_analysis: { status: "complete", data: { detected_name: "Sentry", category: "Error Monitoring", competitors: [] } },
        fast: { status: "running", data: null },
        balanced: { status: "pending", data: null },
        comprehensive: { status: "pending", data: null },
      },
    };
    mockGetJobStatus.mockResolvedValue(mockStatus);

    const res = await callGet("job-1");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.jobId).toBe("job-1");
    expect(data.stages).toHaveProperty("url_analysis");
    expect(data.stages).toHaveProperty("fast");
    expect(data.stages).toHaveProperty("balanced");
    expect(data.stages).toHaveProperty("comprehensive");
  });
});
