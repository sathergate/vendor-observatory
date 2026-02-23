import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock onboard lib ─────────────────────────────────────────────────

const mockCreateJob = vi.fn();
const mockFindRecentJob = vi.fn();

vi.mock("@/lib/onboard", () => ({
  createJob: (...args: unknown[]) => mockCreateJob(...args),
  findRecentJob: (...args: unknown[]) => mockFindRecentJob(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/onboard/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── POST /api/onboard/analyze ────────────────────────────────────────

describe("POST /api/onboard/analyze", () => {
  async function callAnalyze(body: unknown) {
    const { POST } = await import("./route");
    return POST(jsonRequest(body));
  }

  it("returns 400 with error for missing URL", async () => {
    const res = await callAnalyze({ url: "" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid URL");
  });

  it("returns 400 for non-URL string", async () => {
    const res = await callAnalyze({ url: "not a url" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid URL");
  });

  it("returns 200 with jobId when no recent job exists", async () => {
    mockFindRecentJob.mockResolvedValue(null);
    mockCreateJob.mockResolvedValue("new-job-id");

    const res = await callAnalyze({ url: "https://sentry.io" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobId).toBe("new-job-id");
    expect(mockCreateJob).toHaveBeenCalledWith("https://sentry.io", "sentry.io");
  });

  it("returns 200 with existing jobId when findRecentJob returns a hit", async () => {
    mockFindRecentJob.mockResolvedValue("existing-job-id");

    const res = await callAnalyze({ url: "https://sentry.io" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobId).toBe("existing-job-id");
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  it("strips www. prefix from domain", async () => {
    mockFindRecentJob.mockResolvedValue(null);
    mockCreateJob.mockResolvedValue("job-id");

    await callAnalyze({ url: "https://www.sentry.io" });
    expect(mockFindRecentJob).toHaveBeenCalledWith("sentry.io");
    expect(mockCreateJob).toHaveBeenCalledWith("https://www.sentry.io", "sentry.io");
  });

  it("accepts bare domain without https:// prefix", async () => {
    mockFindRecentJob.mockResolvedValue(null);
    mockCreateJob.mockResolvedValue("job-id");

    const res = await callAnalyze({ url: "sentry.io" });
    expect(res.status).toBe(200);
    expect(mockFindRecentJob).toHaveBeenCalledWith("sentry.io");
    expect(mockCreateJob).toHaveBeenCalledWith("https://sentry.io", "sentry.io");
  });
});
