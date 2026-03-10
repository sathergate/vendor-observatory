// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { VendorProvider, useVendor } from "./VendorContext";

// ── Helpers ─────────────────────────────────────────────────────────

/** Small consumer component to surface context values in the DOM */
function VendorDisplay() {
  const { selectedVendor, setSelectedVendor } = useVendor();
  return (
    <div>
      <span data-testid="vendor">{selectedVendor ?? "none"}</span>
      <button onClick={() => setSelectedVendor("supabase")}>pick supabase</button>
      <button onClick={() => setSelectedVendor(null)}>clear</button>
    </div>
  );
}

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  // Mock fetch to return no vendor by default (simulates unauthenticated)
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    json: () => Promise.resolve({ user: null }),
  }));
});

describe("VendorProvider", () => {
  it("defaults to null when localStorage is empty", async () => {
    render(
      <VendorProvider>
        <VendorDisplay />
      </VendorProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vendor").textContent).toBe("none");
    });
  });

  it("hydrates from localStorage on mount", () => {
    localStorage.setItem("vendor-observatory:selected-vendor", "neon");

    render(
      <VendorProvider>
        <VendorDisplay />
      </VendorProvider>,
    );

    expect(screen.getByTestId("vendor").textContent).toBe("neon");
  });

  it("persists selection to localStorage when setSelectedVendor is called", () => {
    localStorage.setItem("vendor-observatory:selected-vendor", "neon");

    render(
      <VendorProvider>
        <VendorDisplay />
      </VendorProvider>,
    );

    act(() => {
      screen.getByText("pick supabase").click();
    });

    expect(screen.getByTestId("vendor").textContent).toBe("supabase");
    expect(localStorage.getItem("vendor-observatory:selected-vendor")).toBe("supabase");
  });

  it("removes localStorage entry when vendor is cleared", () => {
    localStorage.setItem("vendor-observatory:selected-vendor", "sentry");

    render(
      <VendorProvider>
        <VendorDisplay />
      </VendorProvider>,
    );

    expect(screen.getByTestId("vendor").textContent).toBe("sentry");

    act(() => {
      screen.getByText("clear").click();
    });

    expect(screen.getByTestId("vendor").textContent).toBe("none");
    expect(localStorage.getItem("vendor-observatory:selected-vendor")).toBeNull();
  });
});

describe("useVendor outside provider", () => {
  it("returns defaults when used without VendorProvider", () => {
    render(<VendorDisplay />);
    expect(screen.getByTestId("vendor").textContent).toBe("none");
  });
});
