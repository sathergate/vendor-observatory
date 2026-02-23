// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EmailAlertSignup } from "./EmailAlertSignup";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("EmailAlertSignup", () => {
  it("renders an email input pre-populated with defaultEmail", () => {
    render(<EmailAlertSignup defaultEmail="user@test.com" />);

    const input = screen.getByPlaceholderText("you@company.com") as HTMLInputElement;
    expect(input.value).toBe("user@test.com");
  });

  it("submit calls fetch with POST /api/onboard/email-alert and email body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
    vi.stubGlobal("fetch", mockFetch);

    render(<EmailAlertSignup defaultEmail="user@test.com" />);

    const button = screen.getByText("Get alerts");
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/onboard/email-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@test.com" }),
      });
    });
  });

  it("after successful response, form is replaced with success message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
    vi.stubGlobal("fetch", mockFetch);

    render(<EmailAlertSignup defaultEmail="user@test.com" />);

    const button = screen.getByText("Get alerts");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/notify you of significant changes/)).toBeDefined();
    });

    // Form elements should be gone
    expect(screen.queryByPlaceholderText("you@company.com")).toBeNull();
  });

  it("while submitting, the button is disabled", async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
    const mockFetch = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal("fetch", mockFetch);

    render(<EmailAlertSignup defaultEmail="user@test.com" />);

    const button = screen.getByText("Get alerts") as HTMLButtonElement;
    fireEvent.click(button);

    // Button should become disabled while loading
    await waitFor(() => {
      expect(button.disabled).toBe(true);
    });

    // Resolve the fetch
    resolveFetch({ ok: true, json: () => Promise.resolve({ success: true }) });
  });
});
