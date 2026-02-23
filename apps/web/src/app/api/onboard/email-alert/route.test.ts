import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/onboard/email-alert", () => {
  async function callEmailAlert(body: unknown) {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/onboard/email-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it("returns 200 with success for any valid email body", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await callEmailAlert({ email: "user@test.com" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    spy.mockRestore();
  });

  it("console.log is called with the TODO message", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await callEmailAlert({ email: "user@test.com" });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("TODO: subscribe user@test.com to scorecard change alerts"),
    );

    spy.mockRestore();
  });
});
