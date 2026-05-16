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
  it("shows legacy navigation groups when no vendor is selected", () => {
    mockSelectedVendor = null;
    mockPathname = "/";

    render(<Sidebar />);

    expect(screen.queryByText("Loading vendor...")).toBeNull();
    expect(screen.getByText("Benchmarks")).toBeDefined();
    expect(screen.getByText("Vendor Intel").getAttribute("href")).toBe("/benchmarks/vendors");
    expect(screen.getByText("Prompt Intel").getAttribute("href")).toBe("/benchmarks/prompts");
    expect(screen.getByText("Analytics")).toBeDefined();
    expect(screen.getByText("Query").getAttribute("href")).toBe("/query");
    expect(screen.getByText("Search").getAttribute("href")).toBe("/search");
    expect(screen.getByText("Insights").getAttribute("href")).toBe("/insights");
    expect(screen.getByText("Data")).toBeDefined();
    expect(screen.getByText("Vendors").getAttribute("href")).toBe("/vendors");
    expect(screen.getByText("Platforms").getAttribute("href")).toBe("/platforms");
    expect(screen.getByText("Actions").getAttribute("href")).toBe("/actions");
    expect(screen.getByText("Sessions").getAttribute("href")).toBe("/sessions");
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

  it("keeps standard nav groups reachable when vendor is selected", () => {
    mockSelectedVendor = "neon";
    mockPathname = "/";

    render(<Sidebar />);

    expect(screen.getByText("My Dashboard")).toBeDefined();
    expect(screen.getByText("Benchmarks")).toBeDefined();
    expect(screen.getByText("Analytics")).toBeDefined();
    expect(screen.getByText("Data")).toBeDefined();
  });
});
