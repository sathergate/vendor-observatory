// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VendorGuard } from "./VendorGuard";

// ── Mocks ───────────────────────────────────────────────────────────

let mockSelectedVendor: string | null = null;

vi.mock("@/context/VendorContext", () => ({
  useVendor: () => ({
    selectedVendor: mockSelectedVendor,
    setSelectedVendor: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ── Tests ───────────────────────────────────────────────────────────

describe("VendorGuard", () => {
  it("shows 'no vendor selected' when no vendor is chosen", () => {
    mockSelectedVendor = null;

    render(
      <VendorGuard vendorId="supabase">
        <p>Scorecard content</p>
      </VendorGuard>,
    );

    expect(screen.getByText("No vendor selected")).toBeDefined();
    expect(screen.queryByText("Scorecard content")).toBeNull();
  });

  it("shows 'access restricted' when viewing a different vendor's profile", () => {
    mockSelectedVendor = "neon";

    render(
      <VendorGuard vendorId="supabase">
        <p>Scorecard content</p>
      </VendorGuard>,
    );

    expect(screen.getByText("Access restricted")).toBeDefined();
    expect(screen.queryByText("Scorecard content")).toBeNull();

    // Should show a link to their own vendor profile
    const link = screen.getByText("Go to your profile");
    expect(link.getAttribute("href")).toBe("/benchmarks/vendors/neon");
  });

  it("renders children when viewing own vendor profile", () => {
    mockSelectedVendor = "supabase";

    render(
      <VendorGuard vendorId="supabase">
        <p>Scorecard content</p>
      </VendorGuard>,
    );

    expect(screen.getByText("Scorecard content")).toBeDefined();
    expect(screen.queryByText("Access restricted")).toBeNull();
    expect(screen.queryByText("No vendor selected")).toBeNull();
  });

  it("displays the selected vendor name in the restriction message", () => {
    mockSelectedVendor = "datadog";

    render(
      <VendorGuard vendorId="sentry">
        <p>Scorecard content</p>
      </VendorGuard>,
    );

    expect(screen.getByText(/Datadog/)).toBeDefined();
  });

  it("encodes special characters in the profile link href", () => {
    mockSelectedVendor = "fly-io";

    render(
      <VendorGuard vendorId="supabase">
        <p>Scorecard content</p>
      </VendorGuard>,
    );

    const link = screen.getByText("Go to your profile");
    expect(link.getAttribute("href")).toBe("/benchmarks/vendors/fly-io");
  });
});
