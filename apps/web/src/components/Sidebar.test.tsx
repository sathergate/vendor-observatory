// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

// ── Mocks ───────────────────────────────────────────────────────────

let mockSelectedVendor: string | null = null;

vi.mock("@/context/VendorContext", () => ({
  useVendor: () => ({
    selectedVendor: mockSelectedVendor,
    setSelectedVendor: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...props }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

// NavLink uses usePathname internally, so mock it too
vi.mock("./NavLink", () => ({
  NavLink: ({ href, label }: { href: string; label: string }) => (
    <a href={href} data-testid={`navlink-${href}`}>
      {label}
    </a>
  ),
}));

// ── Tests ───────────────────────────────────────────────────────────

describe("Sidebar", () => {
  it("does not show Profile link when no vendor is selected", () => {
    mockSelectedVendor = null;
    mockPathname = "/";

    render(<Sidebar />);

    // Standard nav items should still be present
    expect(screen.getByText("Vendor Intel")).toBeDefined();
    expect(screen.getByText("Prompt Intel")).toBeDefined();

    // No profile link
    const links = screen.queryAllByText(/^Profile/);
    expect(links.length).toBe(0);
  });

  it("shows Profile link when a vendor is selected", () => {
    mockSelectedVendor = "supabase";
    mockPathname = "/";

    render(<Sidebar />);

    const profileLink = screen.getByText(/Profile — Supabase/);
    expect(profileLink).toBeDefined();
    expect(profileLink.getAttribute("href")).toBe("/benchmarks/vendors/supabase");
  });

  it("Profile link uses correct href for vendor IDs with special characters", () => {
    mockSelectedVendor = "cloudflare-workers";
    mockPathname = "/";

    render(<Sidebar />);

    const profileLink = screen.getByText(/Profile — Cloudflare Workers/);
    expect(profileLink).toBeDefined();
    expect(profileLink.getAttribute("href")).toBe("/benchmarks/vendors/cloudflare-workers");
  });

  it("renders all standard nav groups regardless of vendor selection", () => {
    mockSelectedVendor = "neon";
    mockPathname = "/";

    render(<Sidebar />);

    expect(screen.getByText("Benchmarks")).toBeDefined();
    expect(screen.getByText("Analytics")).toBeDefined();
    expect(screen.getByText("Data")).toBeDefined();
    expect(screen.getByText("Vendor Intel")).toBeDefined();
    expect(screen.getByText("Query")).toBeDefined();
    expect(screen.getByText("Sessions")).toBeDefined();
  });
});
