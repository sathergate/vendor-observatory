"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavLink } from "./NavLink";
import { useVendor } from "@/context/VendorContext";
import { vendorDisplayName } from "@/lib/vendor-taxonomy";

// ── Legacy nav (used when FLAG_IA_V2 is OFF) ────────────────────────

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
  { href: `/benchmarks/vendors/${encodeURIComponent(vendorId)}`, label: "My Dashboard" },
  { href: "/rejections", label: "Rejections" },
  { href: "/sessions", label: "Sessions" },
];

// ── IA v2 canonical nav model ───────────────────────────────────────

interface NavArea {
  area: string;
  href: string;
  children?: Array<{ href: string; label: string }>;
}

const IA_V2_NAV: NavArea[] = [
  { area: "Home", href: "/home" },
  {
    area: "Performance",
    href: "/performance",
    children: [
      { href: "/performance/benchmarks", label: "Benchmarks" },
      { href: "/performance/landscape", label: "Competitive Landscape" },
    ],
  },
  {
    area: "Reasons",
    href: "/reasons",
    children: [
      { href: "/reasons/rejections", label: "Rejection Clusters" },
      { href: "/reasons/constraints", label: "Constraint Sensitivity" },
    ],
  },
  {
    area: "Fixes",
    href: "/fixes",
    children: [
      { href: "/fixes/issues", label: "Remediation Issues" },
      { href: "/fixes/docs", label: "Docs/SDK Patches" },
    ],
  },
  {
    area: "Evidence",
    href: "/evidence",
    children: [
      { href: "/evidence/sessions", label: "Sessions" },
      { href: "/evidence/transcripts", label: "Transcripts" },
    ],
  },
  {
    area: "Advanced",
    href: "/lab",
    children: [
      { href: "/lab/query", label: "Query Builder" },
      { href: "/lab/search", label: "Search" },
      { href: "/lab/insights", label: "Insights" },
    ],
  },
];

// ── Sidebar component ───────────────────────────────────────────────

export function Sidebar({ iaV2 = false }: { iaV2?: boolean }) {
  const [open, setOpen] = useState(false);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const { selectedVendor } = useVendor();

  const handleLinkClick = () => setOpen(false);

  const isHome = pathname === "/overview" || pathname === "/benchmarks" || pathname === "/home";

  const toggleArea = (area: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  };

  const isAreaActive = (nav: NavArea) =>
    pathname === nav.href ||
    pathname.startsWith(nav.href + "/") ||
    nav.children?.some(
      (c) => pathname === c.href || pathname.startsWith(c.href + "/"),
    );

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
              href={iaV2 ? "/home" : "/overview"}
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
          {iaV2 ? (
            /* IA v2 navigation */
            <div className="space-y-1">
              {IA_V2_NAV.map((nav) => {
                const active = isAreaActive(nav);
                const expanded = expandedAreas.has(nav.area) || active;

                return (
                  <div key={nav.area}>
                    {nav.children ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleArea(nav.area);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-[6px] text-[13px] font-medium transition-colors ${
                            active
                              ? "text-primary"
                              : "text-secondary hover:text-primary hover:bg-raised"
                          }`}
                        >
                          <span>{nav.area}</span>
                          <span
                            className={`text-[10px] text-muted transition-transform ${
                              expanded ? "rotate-90" : ""
                            }`}
                          >
                            ▸
                          </span>
                        </button>
                        {expanded && (
                          <div className="ml-2 space-y-0.5">
                            {nav.children.map((child) => (
                              <NavLink
                                key={child.href}
                                href={child.href}
                                label={child.label}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <NavLink href={nav.href} label={nav.area} exact />
                    )}
                  </div>
                );
              })}

              {/* Vendor-scoped link when vendor selected */}
              {selectedVendor && (
                <div className="mt-4 pt-4 border-t border-border-subtle">
                  <p className="px-3 text-[11px] text-muted mb-1 uppercase tracking-wider">
                    {vendorDisplayName(selectedVendor)}
                  </p>
                  <NavLink
                    href={`/benchmarks/vendors/${encodeURIComponent(selectedVendor)}`}
                    label="Vendor Scorecard"
                    exact
                  />
                </div>
              )}
            </div>
          ) : (
            /* Legacy navigation */
            selectedVendor ? (
              <div className="space-y-0.5">
                {VENDOR_NAV_LINKS(selectedVendor).map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    exact={link.label === "My Dashboard"}
                  />
                ))}
              </div>
            ) : (
              <div className="px-3 pt-2 pb-1">
                <span className="text-[13px] text-muted">Loading vendor...</span>
              </div>
            )
          )}
        </nav>

        <div className="p-4 border-t border-border-subtle text-[11px] text-muted">
          v0.2.0
        </div>
      </aside>
    </>
  );
}
