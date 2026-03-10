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
  it("shows loading state when no vendor is selected", () => {
    mockSelectedVendor = null;
    mockPathname = "/";

    render(<Sidebar />);

    expect(screen.getByText("Loading vendor...")).toBeDefined();
  });

  it("shows vendor dashboard nav when a vendor is selected", () => {
    mockSelectedVendor = "supabase";
    mockPathname = "/";

    render(<Sidebar />);

    const dashboardLink = screen.getByText("My Dashboard");
    expect(dashboardLink).toBeDefined();
    expect(dashboardLink.getAttribute("href")).toBe("/benchmarks/vendors/supabase");
    expect(screen.getByText("Rejections")).toBeDefined();
  });

  it("vendor nav uses correct href for vendor IDs with special characters", () => {
    mockSelectedVendor = "cloudflare-workers";
    mockPathname = "/";

    render(<Sidebar />);

    const dashboardLink = screen.getByText("My Dashboard");
    expect(dashboardLink).toBeDefined();
    expect(dashboardLink.getAttribute("href")).toBe("/benchmarks/vendors/cloudflare-workers");
  });

  it("hides standard nav groups when vendor is selected", () => {
    mockSelectedVendor = "neon";
    mockPathname = "/";

    render(<Sidebar />);

    expect(screen.getByText("My Dashboard")).toBeDefined();
    expect(screen.queryByText("Benchmarks")).toBeNull();
    expect(screen.queryByText("Analytics")).toBeNull();
    expect(screen.queryByText("Data")).toBeNull();
  });
});
