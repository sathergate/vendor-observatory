"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavLink } from "./NavLink";
import { useVendor } from "@/context/VendorContext";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";

const NAV_GROUPS = [
  {
    label: "Benchmarks",
    links: [
      { href: "/benchmarks/vendors", label: "Vendor Intel" },
      { href: "/benchmarks/prompts", label: "Prompt Intel" },
    ],
  },
  {
    label: "Analytics",
    links: [
      { href: "/query", label: "Query" },
      { href: "/search", label: "Search" },
      { href: "/insights", label: "Insights" },
    ],
  },
  {
    label: "Data",
    links: [
      { href: "/vendors", label: "Vendors" },
      { href: "/platforms", label: "Platforms" },
      { href: "/actions", label: "Actions" },
      { href: "/sessions", label: "Sessions" },
    ],
  },
];

const VENDOR_NAV_LINKS = (vendorId: string) => [
  { href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}`, label: "My Profile" },
  { href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}/implementation`, label: "Implementation Rate" },
  { href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}/competitive`, label: "Competitive Landscape" },
  { href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}/trends`, label: "Confidence Trends" },
  { href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}/use-cases`, label: "Use Cases" },
  { href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}/reasoning`, label: "Reasoning Samples" },
  { href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}/category-competition`, label: "Category Competition" },
  { href: "/rejections", label: "Rejections" },
];

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { selectedVendor } = useVendor();

  const handleLinkClick = () => setOpen(false);

  const isHome = pathname === "/overview" || pathname === "/benchmarks";

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 rounded-[6px] bg-surface border border-border text-secondary hover:text-primary"
        aria-label="Open navigation"
      >
        <div className="space-y-1">
          <div className="w-5 h-0.5 bg-current" />
          <div className="w-5 h-0.5 bg-current" />
          <div className="w-5 h-0.5 bg-current" />
        </div>
      </button>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/60"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel — 220px per style guide */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-[220px] bg-base border-r border-border-subtle
          flex flex-col shrink-0
          transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="p-4 border-b border-border-subtle flex items-center justify-between">
          <div>
            <Link
              href="/overview"
              onClick={handleLinkClick}
              className={`text-[14px] font-semibold transition-colors ${
                isHome ? "text-accent" : "text-primary hover:text-accent"
              }`}
            >
              Vendor Observatory
            </Link>
            <p className="text-[11px] text-muted mt-0.5">Revealed Preference</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-muted hover:text-secondary p-1"
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto" onClick={handleLinkClick}>
          {selectedVendor ? (
            <div className="mb-4">
              <div className="px-3 pt-2 pb-1">
                <span className="section-header">My Dashboard</span>
              </div>
              <div className="space-y-0.5">
                {VENDOR_NAV_LINKS(selectedVendor).map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    exact={link.label === "My Profile"}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="mb-4">
                  <div className="px-3 pt-2 pb-1">
                    <span className="section-header">{group.label}</span>
                  </div>
                  <div className="space-y-0.5">
                    {group.links.map((link) => (
                      <NavLink
                        key={link.href}
                        href={link.href}
                        label={link.label}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-border-subtle text-[11px] text-muted">
          v0.2.0
        </div>
      </aside>
    </>
  );
}
