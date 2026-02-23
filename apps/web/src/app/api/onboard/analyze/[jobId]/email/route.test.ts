import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock onboard lib ─────────────────────────────────────────────────

const mockSaveJobEmail = vi.fn();

vi.mock("@/lib/onboard", () => ({
  saveJobEmail: (...args: unknown[]) => mockSaveJobEmail(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /api/onboard/analyze/[jobId]/email ──────────────────────────

describe("POST /api/onboard/analyze/[jobId]/email", () => {
  async function callEmail(jobId: string, body: unknown) {
    const { POST } = await import("./route");
    const req = new Request(`http://localhost/api/onboard/analyze/${jobId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return POST(req, { params: Promise.resolve({ jobId }) });
  }

  it("calls saveJobEmail with correct jobId and email", async () => {
    mockSaveJobEmail.mockResolvedValue(undefined);

    const res = await callEmail("job-1", { email: "user@test.com" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockSaveJobEmail).toHaveBeenCalledWith("job-1", "user@test.com");
  });

  it("does not throw if job does not exist", async () => {
    mockSaveJobEmail.mockResolvedValue(undefined);

    const res = await callEmail("nonexistent", { email: "user@test.com" });
    expect(res.status).toBe(200);
  });
});
