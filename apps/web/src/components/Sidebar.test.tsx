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

  it("shows vendor dashboard nav when a vendor is selected", () => {
    mockSelectedVendor = "supabase";
    mockPathname = "/";

    render(<Sidebar />);

    // Vendor nav shows "My Dashboard" group with vendor-specific links
    expect(screen.getByText("My Dashboard")).toBeDefined();
    const profileLink = screen.getByText("My Profile");
    expect(profileLink).toBeDefined();
    expect(profileLink.getAttribute("href")).toBe("/benchmarks/vendors/supabase");
    expect(screen.getByText("Implementation Rate")).toBeDefined();
    expect(screen.getByText("Competitive Landscape")).toBeDefined();
    expect(screen.getByText("Confidence Trends")).toBeDefined();
    expect(screen.getByText("Use Cases")).toBeDefined();
    expect(screen.getByText("Reasoning Samples")).toBeDefined();
    expect(screen.getByText("Category Competition")).toBeDefined();
  });

  it("vendor nav uses correct href for vendor IDs with special characters", () => {
    mockSelectedVendor = "cloudflare-workers";
    mockPathname = "/";

    render(<Sidebar />);

    const profileLink = screen.getByText("My Profile");
    expect(profileLink).toBeDefined();
    expect(profileLink.getAttribute("href")).toBe("/benchmarks/vendors/cloudflare-workers");
  });

  it("hides standard nav groups when vendor is selected", () => {
    mockSelectedVendor = "neon";
    mockPathname = "/";

    render(<Sidebar />);

    // Vendor users see "My Dashboard" instead of standard groups
    expect(screen.getByText("My Dashboard")).toBeDefined();
    expect(screen.queryByText("Benchmarks")).toBeNull();
    expect(screen.queryByText("Analytics")).toBeNull();
    expect(screen.queryByText("Data")).toBeNull();
  });
});
